"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Headphones, History, MessageCircle, Plus, Send, Sparkles, X } from "lucide-react";
import { ChatTurn } from "@/components/chat/chat-turn";
import { SupportActionCard } from "@/components/support/support-action-card";
import { SupportChoiceBar } from "@/components/support/support-choice-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { easeOut } from "@/components/motion/variants";
import {
  fetchAgentBySlug,
  fetchSupportThreadMessages,
  fetchSupportThreads,
  invokeAgentStream,
} from "@/lib/api";
import { handleApiError } from "@/lib/api-error-handler";
import { toast } from "sonner";
import {
  applyGuideHighlight,
  applySupportUiAction,
  buildSupportObservationMessage,
  buildSupportUserMessage,
  formatRunStateBlock,
  parseSupportHighlight,
  supportActionLabel,
  type SupportUiAction,
} from "@/lib/page-guide-context";
import { getRunState, wizardScopeKey, type RunState } from "@/lib/run-state-client";
import { captureUiSnapshot } from "@/lib/ui-snapshot";
import type { SupportUiScript, SupportPlayProgress } from "@/lib/support-ui-script";
import {
  SupportUiAbortError,
  SupportUiBlockedError,
  useSupportUiPlayer,
} from "@/components/support/support-ui-player";
import {
  finalizeSupportAssistantText,
  formatStreamingSupportReply,
  missionStatusLine,
  sanitizeSupportAssistantText,
  supportCompletionLine,
} from "@/lib/support-assistant-text";
import { humanizeSupportError } from "@/lib/support-error-text";
import type { SupportUserChoice } from "@/lib/chat-message-types";
import {
  buildContinueTestingPayload,
  buildWizardContinueTestingScript,
  buildWizardCreateBridgeScript,
  isWizardCreateMissionIncomplete,
  isWizardTestingMissionIncomplete,
  readCreatedAgentSlug,
  readStoredWizardCreatePayload,
  readWizardFormSnapshot,
  scriptHasWizardCreateBridge,
  shouldBlockWizardCreateWalk,
  isWizardContinueIntent,
} from "@/lib/support-wizard-mission";
import { inspectWizardCreatePage } from "@/lib/support-page-state";
import {
  MAX_WIZARD_RECOVERY_ATTEMPTS,
  tryRecoverWizardBlocker,
} from "@/lib/support-wizard-recovery";
import { resolveVisiblePlanningOnPage, isWizardPlanningQuestionsVisible } from "@/lib/support-testing-actions";
import { healIncompleteWizardMission, resolveLocalWizardContinueScript } from "@/lib/support-wizard-heal";
import { tryAutoResolveSupportError } from "@/lib/support-auto-recovery";
import {
  buildSupportErrorChoices,
  clearWidgetStepSkip,
  formatSupportErrorWithChoices,
  markWidgetStepSkipped,
  parseChoiceWidgetKind,
} from "@/lib/support-user-choices";
import { ensureAgentWidgetEnabled } from "@/lib/support-widget-plan-enable";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { useLlmStreamLoading, withGeneratingPhase } from "@/hooks/use-llm-stream-loading";
import { ClientDateTime } from "@/components/ui/client-date";
import {
  createSupportSessionThreadId,
  getActiveSupportThreadId,
  mergeSupportSessions,
  readSupportChatCache,
  readSupportSessions,
  restoreSupportMessages,
  setActiveSupportThreadId,
  upsertSupportSession,
  writeSupportChatCache,
  writeSupportSessions,
  type SupportChatMessage,
  type SupportSessionMeta,
} from "@/lib/support-chat";
import { useAuthStore } from "@/stores/auth-store";
import { AnimatePresence, motion } from "framer-motion";
import { checkUiAutomationPermission, deriveUserCapabilities, pathRequiresSuperuser } from "@/lib/user-capabilities";
import {
  AUTONOMY_BLOCKED_FA,
  AUTONOMY_LABELS,
  canRunAutomation,
  coerceLevel,
  type AutonomyLevel,
} from "@/lib/autonomy-policy";
import {
  fetchAutonomyDefault,
  fetchUserPreferences,
  updateUserPreferences,
} from "@/lib/api";
import { useFeatureFlag } from "@/lib/feature-flags";
import { matchAndRunSkill } from "@/lib/skill-runner";
import { cn } from "@/lib/utils";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";
import {
  SUPPORT_COMPOSE_EVENT,
  type SupportComposeDetail,
} from "@/lib/support-compose";

const SUPPORT_SLUG = "support";
const MAX_UI_OBSERVE_LOOPS = 6;

function shouldContinueUiLoop(
  script: SupportUiScript | undefined,
  assistantAnswer: string,
  pathname: string
): boolean {
  if (isWizardCreateMissionIncomplete(pathname)) return true;
  if (isWizardTestingMissionIncomplete(pathname)) return true;

  if (scriptHasWizardCreateBridge(script)) {
    return (
      isWizardCreateMissionIncomplete(pathname) ||
      isWizardTestingMissionIncomplete(pathname)
    );
  }

  if (!script?.steps.length) return false;

  const hasInteractive = script.steps.some(
    (s) =>
      s.type === "click" ||
      s.type === "type" ||
      s.type === "select" ||
      s.type === "bridge"
  );
  if (hasInteractive) return false;

  const taskDone =
    /(?:فعال شد|ساخته شد|✓|تمام شد|HTTP\s+\d{3}|provision|تست API)/i.test(
      assistantAnswer
    );
  if (taskDone) return false;

  return script.steps.some(
    (s) => s.type === "navigate" || s.type === "wait_for_dom" || s.type === "wait"
  );
}

const QUICK_PROMPTS = [
  "این صفحه برای چیست؟",
  "چطور از اینجا شروع کنم؟",
  "یک ایجنت جدید بساز",
];

function slugFromActionPath(path: string | undefined): string | null {
  if (!path) return null;
  const agentMatch = path.match(/^\/agents\/([^/?]+)/);
  if (agentMatch) return agentMatch[1];
  try {
    const url = new URL(path, "http://local");
    return url.searchParams.get("slug");
  } catch {
    return null;
  }
}

function invalidateAfterAction(qc: ReturnType<typeof useQueryClient>, action: SupportUiAction) {
  if (action.kind === "agent_created" || action.kind === "agent_wizard") {
    void qc.invalidateQueries({ queryKey: ["agents"] });
  }
  const path = action.type === "navigate" ? action.path : undefined;
  const slug =
    slugFromActionPath(path) ??
    (action.type === "open_widget_builder" ? action.agent_slug : null);

  if (path?.startsWith("/agents/create") && path.includes("slug=")) {
    void qc.invalidateQueries({ queryKey: ["agent-validation"] });
  }

  if (slug) {
    void qc.invalidateQueries({ queryKey: ["agent", slug] });
  }
  if (action.kind === "widget_generated" || action.kind === "agent_wizard") {
    void qc.invalidateQueries({ queryKey: ["agent-dashboard"] });
  }
}

export function PlatformSupportAssistant() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const capabilities = useMemo(() => deriveUserCapabilities(user), [user]);
  const isAdmin = capabilities.isSuperuser;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [sessions, setSessions] = useState<SupportSessionMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(true);
  const llmLoading = useLlmStreamLoading();
  const [error, setError] = useState<string | null>(null);
  const [uiProgress, setUiProgress] = useState<SupportPlayProgress | null>(null);
  const supportThreadIdRef = useRef<string | undefined>();
  const pendingComposeRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { playScript, playing: uiPlaying, stopScript } = useSupportUiPlayer();
  const runStateRef = useRef<RunState | null>(null);

  // Effective support autonomy level (plan M3.1): session override > user pref > org default.
  const [orgAutonomyDefault, setOrgAutonomyDefault] = useState<AutonomyLevel>(1);
  const graduatedAutonomyEnabled = useFeatureFlag("graduated_autonomy_v1");
  const { data: myPreferences } = useQuery({
    queryKey: ["user-preferences"],
    queryFn: fetchUserPreferences,
    staleTime: 2 * 60_000,
    enabled: graduatedAutonomyEnabled,
  });
  useEffect(() => {
    let active = true;
    fetchAutonomyDefault()
      .then((d) => {
        if (active) setOrgAutonomyDefault(coerceLevel(d.level));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const effectiveAutonomy = (): AutonomyLevel => {
    if (!graduatedAutonomyEnabled) return 2; // legacy: admins run bridges (already role-gated)
    const sessionOverride = runStateRef.current?.payload?.autonomy_level;
    if (sessionOverride !== undefined && sessionOverride !== null) {
      return coerceLevel(sessionOverride);
    }
    if (myPreferences?.support_autonomy_level !== undefined) {
      return coerceLevel(myPreferences.support_autonomy_level);
    }
    return orgAutonomyDefault;
  };

  const refreshRunState = useCallback(async () => {
    const key = wizardScopeKey();
    if (!key) return;
    runStateRef.current = await getRunState({ type: "wizard", key });
  }, []);

  const { data: agent } = useQuery({
    queryKey: ["support-agent", SUPPORT_SLUG],
    queryFn: () => fetchAgentBySlug(SUPPORT_SLUG),
    staleTime: 5 * 60_000,
  });

  const loadSessions = useCallback(async () => {
    if (!user?.id || !agent?.id) return;
    const local = readSupportSessions(user.id, agent.id);
    try {
      const remote = await fetchSupportThreads(agent.id);
      setSessions(mergeSupportSessions(local, remote));
    } catch {
      setSessions(local);
    }
  }, [user?.id, agent?.id]);

  const loadThread = useCallback(
    async (threadId: string) => {
      if (!user?.id || !agent?.id) return;
      setHistoryReady(false);
      setActiveThreadId(threadId);
      setActiveSupportThreadId(user.id, agent.id, threadId);
      supportThreadIdRef.current = threadId;

      const cached = readSupportChatCache(user.id, agent.id, threadId);
      if (cached?.length) {
        setMessages(cached);
      } else {
        setMessages([]);
      }

      try {
        const rows = await fetchSupportThreadMessages(agent.id, threadId);
        const restored = restoreSupportMessages(rows);
        setMessages(restored);
        if (restored.length) {
          writeSupportChatCache(user.id, agent.id, threadId, restored);
        }
      } catch {
        /* keep local cache */
      } finally {
        setHistoryReady(true);
      }
    },
    [user?.id, agent?.id]
  );

  useEffect(() => {
    if (!user?.id || !agent?.id) return;
    const localSessions = readSupportSessions(user.id, agent.id);
    const stored =
      getActiveSupportThreadId(user.id, agent.id) ??
      localSessions[0]?.threadId ??
      createSupportSessionThreadId(user.id, agent.id);
    void loadThread(stored);
    void loadSessions();
  }, [user?.id, agent?.id, loadThread, loadSessions]);

  useEffect(() => {
    if (!user?.id || !agent?.id || !activeThreadId || loading) return;
    const persisted = messages.filter(
      (m) => m.role === "user" || m.content.trim().length > 0
    );
    if (persisted.length) {
      writeSupportChatCache(user.id, agent.id, activeThreadId, persisted);
      const firstUser = persisted.find((m) => m.role === "user")?.content?.trim();
      if (firstUser) {
        const next = upsertSupportSession(
          user.id,
          agent.id,
          activeThreadId,
          firstUser.slice(0, 60)
        );
        setSessions(next);
      }
    }
  }, [messages, loading, user?.id, agent?.id, activeThreadId]);

  const startNewConversation = useCallback(() => {
    if (!user?.id || !agent?.id) return;
    if (uiPlaying) stopScript();
    setError(null);
    setHistoryOpen(false);
    const threadId = createSupportSessionThreadId(user.id, agent.id);
    const now = new Date().toISOString();
    const meta: SupportSessionMeta = {
      threadId,
      title: "گفتگوی جدید",
      updatedAt: now,
    };
    const next = [meta, ...readSupportSessions(user.id, agent.id)].slice(0, 50);
    writeSupportSessions(user.id, agent.id, next);
    writeSupportChatCache(user.id, agent.id, threadId, []);
    setSessions(next);
    setActiveThreadId(threadId);
    setActiveSupportThreadId(user.id, agent.id, threadId);
    supportThreadIdRef.current = threadId;
    setMessages([]);
    setHistoryReady(true);
  }, [agent?.id, stopScript, uiPlaying, user?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
  }, [messages, loading, uiProgress]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!open || !panel) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    gsap.fromTo(
      panel,
      { opacity: 0, y: 14, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: "power2.out" }
    );
  }, [open]);

  const formatAssistantReply = useCallback((raw: string) => {
    return finalizeSupportAssistantText(
      parseSupportHighlight(formatAssistantOutput(raw)).answer
    );
  }, []);

  const runUiOutcome = useCallback(
    async (
      uiScript: SupportUiScript | undefined,
      uiAction: SupportUiAction | undefined,
      assistantBase: string
    ): Promise<boolean> => {
      const base =
        finalizeSupportAssistantText(assistantBase) || "در حال انجام درخواست شما…";
      const script =
        uiScript ??
        (uiAction?.type === "navigate" && uiAction.path
          ? {
              label: supportActionLabel(uiAction),
              steps: [
                {
                  type: "navigate" as const,
                  path: uiAction.path,
                  label: supportActionLabel(uiAction),
                },
              ],
            }
          : undefined);

      if (!script) {
        applySupportUiAction(uiAction, (path) => router.push(path));
        if (assistantBase.trim()) {
          const doneLine = "✓ تمام شد.";
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              const clean = finalizeSupportAssistantText(assistantBase, {
                stripProgress: true,
              });
              copy[copy.length - 1] = {
                ...last,
                content: clean ? `${clean}\n\n${doneLine}` : doneLine,
              };
            }
            return copy;
          });
        }
        return true;
      }

      const denial = checkUiAutomationPermission(capabilities, script, uiAction);
      if (denial) {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = {
              ...last,
              content: `⚠ ${denial}`,
              uiTask: undefined,
            };
          }
          return copy;
        });
        setError(denial);
        return false;
      }

      // Graduated autonomy gate (plan M3.3): bridge/full actions need L2/L3.
      // Skipped entirely when the rollout flag is off (legacy role/capability behavior).
      if (graduatedAutonomyEnabled) {
        const autonomy = effectiveAutonomy();
        const hasBridge = Boolean(script?.steps.some((s) => s.type === "bridge"));
        const needsFull = Boolean(
          script?.steps.some(
            (s) => s.type === "navigate" && pathRequiresSuperuser(s.path)
          )
        );
        if (needsFull && !canRunAutomation(autonomy, "full")) {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: `⚠ ${AUTONOMY_BLOCKED_FA}`,
                uiTask: undefined,
              };
            }
            return copy;
          });
          setError(AUTONOMY_BLOCKED_FA);
          return false;
        }
        if (hasBridge && !canRunAutomation(autonomy, "bridge")) {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: `⚠ ${AUTONOMY_BLOCKED_FA}`,
                uiTask: undefined,
              };
            }
            return copy;
          });
          setError(AUTONOMY_BLOCKED_FA);
          return false;
        }
      }

      try {
        const onProgress = (p: SupportPlayProgress) => {
          setUiProgress(p);
          const line = missionStatusLine(p.step, p.total, p.label);
          const uiTask = {
            label: p.scriptLabel || script.label,
            step: p.step,
            total: p.total,
            status: p.label,
          };
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: `${base}\n\n${line}`,
                uiTask,
              };
            }
            return copy;
          });
        };

        const playWithRecovery = async (target: SupportUiScript) => {
          let recoveryAttempt = 0;
          for (;;) {
            try {
              await playScript(target, { onProgress });
              return;
            } catch (err) {
              const errMsg = humanizeSupportError(err);
              if (recoveryAttempt >= MAX_WIZARD_RECOVERY_ATTEMPTS - 1) {
                throw err;
              }

              let recovered = false;
              if (err instanceof SupportUiBlockedError) {
                recovered = await tryRecoverWizardBlocker(null, err.blockerText);
              }
              if (!recovered) {
                recovered = await tryAutoResolveSupportError(errMsg, null);
              }

              if (recovered) {
                recoveryAttempt += 1;
                setMessages((m) => {
                  const copy = [...m];
                  const last = copy[copy.length - 1];
                  if (last?.role === "assistant") {
                    copy[copy.length - 1] = {
                      ...last,
                      content: `${base}\n\nرفع خودکار خطا (${recoveryAttempt}/${MAX_WIZARD_RECOVERY_ATTEMPTS})…`,
                    };
                  }
                  return copy;
                });
                continue;
              }
              throw err;
            }
          }
        };

        await playWithRecovery(script);

        await resolveVisiblePlanningOnPage();

        let finalScript = script;
        const livePath = window.location.pathname;
        // Prefer continue_testing whenever an agent already exists — never a second create.
        if (
          shouldBlockWizardCreateWalk() ||
          isWizardTestingMissionIncomplete(livePath)
        ) {
          const slug = readCreatedAgentSlug();
          if (slug) {
            const healScript = buildWizardContinueTestingScript(
              buildContinueTestingPayload(slug)
            );
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: `${base}\n\n**ادامه خودکار:** مرحله تست ناقص بود — آموزش و پنل را ادامه می‌دهم (بدون بازگشت به مرحله ۱)…`,
                };
              }
              return copy;
            });
            await playWithRecovery(healScript);
            finalScript = healScript;
          }
        } else if (
          !scriptHasWizardCreateBridge(script) &&
          isWizardCreateMissionIncomplete(livePath)
        ) {
          const snapshot =
            readWizardFormSnapshot() ?? readStoredWizardCreatePayload();
          if (snapshot?.name) {
            const healScript = buildWizardCreateBridgeScript(snapshot);
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                copy[copy.length - 1] = {
                  ...last,
                  content: `${base}\n\n**ادامه خودکار:** ویزارد ناقص بود — مراحل باقی‌مانده تا شروع تست را اجرا می‌کنم…`,
                };
              }
              return copy;
            });
            await playWithRecovery(healScript);
            finalScript = healScript;
          }
        }

        let healRound = 0;
        while (
          isWizardTestingMissionIncomplete(window.location.pathname) &&
          healRound < 2
        ) {
          const slug = readCreatedAgentSlug();
          if (!slug) break;
          healRound += 1;
          const healScript = buildWizardContinueTestingScript(
            buildContinueTestingPayload(slug)
          );
          await playWithRecovery(healScript);
          finalScript = healScript;
        }

        const doneLine = supportCompletionLine(finalScript);
        const stillIncomplete =
          isWizardCreateMissionIncomplete(window.location.pathname) ||
          isWizardTestingMissionIncomplete(window.location.pathname) ||
          isWizardPlanningQuestionsVisible();

        if (stillIncomplete) {
          const planningOpen = isWizardPlanningQuestionsVisible();
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              const clean = finalizeSupportAssistantText(base, { stripProgress: true });
              copy[copy.length - 1] = {
                ...last,
                content: planningOpen
                  ? `${clean}\n\n⏳ سؤالات برنامه‌ریزی هنوز باز است — در حال تلاش برای پاسخ خودکار…`
                  : `${clean}\n\n⏳ تست هنوز تمام نشده — ادامه می‌دهم…`,
                uiTask: undefined,
                userChoices: planningOpen
                  ? buildSupportErrorChoices("سؤالات برنامه‌ریزی تست")
                  : undefined,
              };
            }
            return copy;
          });
          const healed = await healIncompleteWizardMission((s) => playWithRecovery(s));
          if (healed === "none" && planningOpen) {
            await resolveVisiblePlanningOnPage();
          }
          if (isWizardTestingMissionIncomplete(window.location.pathname)) {
            return false;
          }
        }

        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            const clean = finalizeSupportAssistantText(base, { stripProgress: true });
            copy[copy.length - 1] = {
              ...last,
              content: clean ? `${clean}\n\n${doneLine}` : doneLine,
              uiTask: undefined,
            };
          }
          return copy;
        });
        return true;
      } catch (e) {
        if (e instanceof SupportUiAbortError) {
          const stopMsg = humanizeSupportError(e);
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: `⏸ ${stopMsg}`,
                uiTask: undefined,
              };
            }
            return copy;
          });
          return false;
        }

        const errMsg = humanizeSupportError(e);
        const autoFixed = await tryAutoResolveSupportError(errMsg, null);
        if (autoFixed) {
          try {
            // playWithRecovery is defined in the try-block only; re-run via playScript here.
            const replay = async (target: SupportUiScript) => {
              await playScript(target, {
                onProgress: (p: SupportPlayProgress) => {
                  setUiProgress(p);
                  const line = missionStatusLine(p.step, p.total, p.label);
                  setMessages((m) => {
                    const copy = [...m];
                    const last = copy[copy.length - 1];
                    if (last?.role === "assistant") {
                      copy[copy.length - 1] = {
                        ...last,
                        content: `${base}\n\n${line}`,
                        uiTask: {
                          label: p.scriptLabel || target.label,
                          step: p.step,
                          total: p.total,
                          status: p.label,
                        },
                      };
                    }
                    return copy;
                  });
                },
              });
            };
            await replay(script);
            let finalScript = script;
            const livePath = window.location.pathname;
            if (
              shouldBlockWizardCreateWalk() ||
              isWizardTestingMissionIncomplete(livePath)
            ) {
              const slug = readCreatedAgentSlug();
              if (slug) {
                const healScript = buildWizardContinueTestingScript(
                  buildContinueTestingPayload(slug)
                );
                await replay(healScript);
                finalScript = healScript;
              }
            } else if (
              !scriptHasWizardCreateBridge(script) &&
              isWizardCreateMissionIncomplete(livePath)
            ) {
              const snapshot =
                readWizardFormSnapshot() ?? readStoredWizardCreatePayload();
              if (snapshot?.name) {
                const healScript = buildWizardCreateBridgeScript(snapshot);
                await replay(healScript);
                finalScript = healScript;
              }
            }
            const doneLine = supportCompletionLine(finalScript);
            setMessages((m) => {
              const copy = [...m];
              const last = copy[copy.length - 1];
              if (last?.role === "assistant") {
                const clean = finalizeSupportAssistantText(base, { stripProgress: true });
                copy[copy.length - 1] = {
                  ...last,
                  content: clean
                    ? `${clean}\n\n${doneLine}\n\n(خطا خودکار برطرف شد)`
                    : `${doneLine}\n\n(خطا خودکار برطرف شد)`,
                  uiTask: undefined,
                  userChoices: undefined,
                };
              }
              return copy;
            });
            return true;
          } catch {
            /* fall through to user choices */
          }
        }

        const choices = buildSupportErrorChoices(errMsg);
        const content = formatSupportErrorWithChoices(errMsg);
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = {
              ...last,
              content,
              uiTask: undefined,
              userChoices: choices,
            };
          }
          return copy;
        });
        setError(errMsg);
        return false;
      } finally {
        setUiProgress(null);
      }
    },
    [capabilities, playScript, router]
  );

  const runSupportInvoke = useCallback(
    async (
      payload: string,
      threadId: string,
      appendAssistant: boolean
    ): Promise<{
      answer: string;
      uiScript?: SupportUiScript;
      uiAction?: SupportUiAction;
      selector?: string;
    }> => {
      if (!agent) {
        return { answer: "" };
      }
      let assistant = "";
      if (appendAssistant) {
        setMessages((m) => [...m, { role: "assistant", content: "", isStreaming: true }]);
      }

      const patchStreamingMessage = (content: string, isStreaming = true) => {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant") {
            copy[copy.length - 1] = { ...last, content, isStreaming };
          }
          return copy;
        });
      };

      const { uiActions, uiScript } = await invokeAgentStream(
        agent.id,
        payload,
        withGeneratingPhase((token) => {
          assistant += token;
          const streamed = formatStreamingSupportReply(assistant);
          if (streamed.trim()) patchStreamingMessage(streamed);
        }, llmLoading),
        threadId,
        (finalOut) => {
          assistant = finalOut;
          const answer = formatAssistantReply(finalOut);
          patchStreamingMessage(answer, false);
        },
        llmLoading.callbacks
      );
      const answer = formatAssistantReply(assistant);
      const { selector, uiAction: parsedAction } = parseSupportHighlight(
        formatAssistantOutput(assistant)
      );
      const uiAction = uiActions.at(-1) ?? parsedAction;
      const thinking = llmLoading.snapshotThinking();
      setMessages((m) => {
        const copy = [...m];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = {
            ...last,
            content: answer,
            uiAction,
            isStreaming: false,
            thinking: thinking ?? last.thinking,
          };
        }
        return copy;
      });
      return { answer, uiScript, uiAction, selector };
    },
    [agent, formatAssistantReply, llmLoading]
  );

  const send = useCallback(
    async (textOverride?: string) => {
      const text = (textOverride ?? input).trim();
      if (!text || !agent || loading) return;
      if (uiPlaying) stopScript();
      setInput("");
      setError(null);
      setLoading(true);
      setThinkingOpen(true);
      llmLoading.begin("در حال ارسال به دستیار پشتیبانی…");
      setMessages((m) => [...m, { role: "user", content: text }]);

      const livePath =
        typeof window !== "undefined" ? window.location.pathname : pathname;
      if (livePath.startsWith("/agents/create") && isWizardContinueIntent(text)) {
        const localScript = await resolveLocalWizardContinueScript(livePath);
        if (localScript) {
          // Local continue runs a bridge (continue_testing) — requires autonomy L2+
          // when graduated autonomy is enabled; otherwise legacy behavior runs it.
          if (graduatedAutonomyEnabled && effectiveAutonomy() < 2) {
            setMessages((m) => [
              ...m,
              {
                role: "assistant",
                content: `⚠ ${AUTONOMY_BLOCKED_FA}`,
                isStreaming: false,
              },
            ]);
            setError(AUTONOMY_BLOCKED_FA);
            return;
          }
          const pageState = inspectWizardCreatePage(livePath);
          const intro =
            pageState === "wizard_steps_incomplete"
              ? "ادامه ساخت ویزارد از مرحله فعلی (۱ تا ۵)…"
              : "ادامه تست از همین‌جا — بدون بازگشت به مرحله ۱…";
          setMessages((m) => [
            ...m,
            { role: "assistant", content: intro, isStreaming: false },
          ]);
          setLoading(false);
          llmLoading.complete();
          const uiOk = await runUiOutcome(localScript, undefined, intro);
          if (!uiOk) {
            setError("اجرای خودکار متوقف شد — می‌توانید دوباره «ادامه بده» بزنید.");
          }
          return;
        }
      }

      await refreshRunState();

      // Phase 2 M1: try a stored skill before the LLM loop.
      // Gated by SKILL_LIBRARY_V1 on the backend; runs only when
      // confidence >= 0.75 and effective autonomy >= L2. SKILL_LIBRARY_V1 off
      // (or no match) falls back to the LLM path below.
      if (graduatedAutonomyEnabled && effectiveAutonomy() >= 2) {
        const state = runStateRef.current;
        const skillRes = await matchAndRunSkill({
          runState: (state ?? {}) as Record<string, unknown>,
          message: text,
          pathname: livePath,
          autonomyLevel: effectiveAutonomy(),
          playScript: (script, opts) =>
            playScript(script, {
              onProgress: (p) => {
                setUiProgress(p);
                const line = missionStatusLine(p.step, p.total, p.label);
                setMessages((m) => {
                  const copy = [...m];
                  const last = copy[copy.length - 1];
                  if (last?.role === "assistant") {
                    copy[copy.length - 1] = {
                      ...last,
                      content: `${last.content ? last.content + "\n\n" : ""}${line}`,
                      uiTask: {
                        label: p.scriptLabel || script.label,
                        step: p.step,
                        total: p.total,
                        status: p.label,
                      },
                    };
                  }
                  return copy;
                });
              },
            }),
        });
        if (skillRes === "ran") {
          setLoading(false);
          llmLoading.complete();
          return;
        }
      }

      const runBlock = formatRunStateBlock(runStateRef.current);
      let payload = buildSupportUserMessage(pathname, text, isAdmin, captureUiSnapshot());
      if (runBlock) payload = `${payload}\n\n${runBlock}`;
      const threadId = supportThreadIdRef.current ?? activeThreadId;
      if (!threadId) {
        setLoading(false);
        setError("گفت‌وگوی پشتیبانی هنوز آماده نیست — چند لحظه دیگر دوباره ارسال کنید.");
        return;
      }

      try {
        let loop = 0;
        let lastScript: SupportUiScript | undefined;

        while (loop < MAX_UI_OBSERVE_LOOPS) {
          const { answer, uiScript, uiAction, selector } = await runSupportInvoke(
            payload,
            threadId,
            loop === 0
          );
          applyGuideHighlight(selector);
          lastScript = uiScript;

          if (uiScript || uiAction) {
            if (uiAction) invalidateAfterAction(qc, uiAction);
            const uiOk = await runUiOutcome(uiScript, uiAction, answer);
            if (!uiOk) break;
          }

          const continueLoop =
            shouldContinueUiLoop(uiScript, answer, window.location.pathname) &&
            loop + 1 < MAX_UI_OBSERVE_LOOPS;
          if (!continueLoop) break;

          await new Promise((r) => setTimeout(r, 400));
          await refreshRunState();
          payload = buildSupportObservationMessage(
            window.location.pathname,
            isAdmin,
            "بررسی نتیجه — اگر کار تمام است خلاصه بده، وگرنه مرحله UI بعدی",
            captureUiSnapshot()
          );
          const loopRunBlock = formatRunStateBlock(runStateRef.current);
          if (loopRunBlock) payload = `${payload}\n\n${loopRunBlock}`;
          loop += 1;
        }

        if (lastScript && loop >= MAX_UI_OBSERVE_LOOPS - 1) {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") {
              copy[copy.length - 1] = {
                ...last,
                content: `${last.content}\n\n(حداکثر مراحل UI — در صورت نیاز دستور بعدی را بفرستید)`,
              };
            }
            return copy;
          });
        }
      } catch (e: unknown) {
        setMessages((m) => m.filter((_, i) => i !== m.length - 1 || m[m.length - 1].content));
        const message = humanizeSupportError(e);
        setError(message);
        handleApiError(e, { toast: false, toastTitle: "خطا در پشتیبانی" });
        toast.error("خطا در پشتیبانی", { description: message });
      } finally {
        setLoading(false);
        llmLoading.complete();
      }
    },
    [
      agent,
      formatAssistantReply,
      input,
      isAdmin,
      loading,
      pathname,
      qc,
      runSupportInvoke,
      runUiOutcome,
      stopScript,
      activeThreadId,
      uiPlaying,
      refreshRunState,
    ]
  );

  useEffect(() => {
    function onCompose(e: Event) {
      const { message, open = true } = (e as CustomEvent<SupportComposeDetail>).detail;
      if (!message.trim()) return;
      if (open) setOpen(true);
      pendingComposeRef.current = message.trim();
    }
    window.addEventListener(SUPPORT_COMPOSE_EVENT, onCompose);
    return () => window.removeEventListener(SUPPORT_COMPOSE_EVENT, onCompose);
  }, []);

  useEffect(() => {
    const pending = pendingComposeRef.current;
    if (!pending || !agent || !historyReady || loading) return;
    pendingComposeRef.current = null;
    void send(pending);
  }, [agent, historyReady, loading, send]);

  const wasUiPlayingRef = useRef(false);
  useEffect(() => {
    const finishedRun = wasUiPlayingRef.current && !uiPlaying && !loading;
    wasUiPlayingRef.current = uiPlaying;
    if (!finishedRun || !agent) return;

    const blockCreate = shouldBlockWizardCreateWalk();
    const createIncomplete =
      !blockCreate && isWizardCreateMissionIncomplete(pathname);
    const testingIncomplete =
      blockCreate || isWizardTestingMissionIncomplete(pathname);
    if (!createIncomplete && !testingIncomplete) return;

    const timer = setTimeout(() => {
      void (async () => {
        const healed = await healIncompleteWizardMission((s) => playScript(s));
        if (healed !== "none") return;
        // Never ask the model to "complete incomplete wizard" once an agent exists —
        // that triggers platform_create_agent and a second agent from step 1.
        void send(
          createIncomplete
            ? "ادامه خودکار — ویزارد ناقص را تکمیل کن"
            : "ادامه خودکار — فقط مرحله تست را ادامه بده. ایجنت جدید نساز و به مرحله ۱ برنگرد."
        );
      })();
    }, 900);
    return () => clearTimeout(timer);
  }, [uiPlaying, loading, agent, pathname, send, playScript]);

  const handleSupportChoice = useCallback(
    async (choice: SupportUserChoice) => {
      if (loading || uiPlaying) return;

      setMessages((m) =>
        m.map((msg, i) =>
          i === m.length - 1 && msg.role === "assistant"
            ? { ...msg, userChoices: undefined }
            : msg
        )
      );

      const widgetKind = parseChoiceWidgetKind(choice.id);
      const slug = readCreatedAgentSlug();

      if (choice.id.startsWith("enable_widget:") && widgetKind && slug) {
        setLoading(true);
        try {
          const agentRow = await fetchAgentBySlug(slug);
          await ensureAgentWidgetEnabled(agentRow.id, slug, widgetKind);
          clearWidgetStepSkip(widgetKind);
          toast.success("ویجت فعال شد", {
            description: "ادامه تست را دوباره اجرا می‌کنم…",
          });
          void send("ادامه بده — ویجت را فعال کردی، تست را ادامه بده");
        } catch (e) {
          const message = humanizeSupportError(e);
          setError(message);
          toast.error(message);
        } finally {
          setLoading(false);
        }
        return;
      }

      if (choice.id.startsWith("skip_widget:") && widgetKind) {
        markWidgetStepSkipped(widgetKind);
        void send(`بدون ${widgetKind === "stat_cards" ? "کارت KPI" : "این ویجت"} ادامه بده`);
        return;
      }

      if (choice.id === "auto_planning" && slug) {
        setLoading(true);
        try {
          const resolved = await resolveVisiblePlanningOnPage();
          if (resolved) {
            void send("ادامه بده — سؤالات برنامه‌ریزی را پاسخ دادم");
          } else {
            void send("دوباره تلاش کن برای پاسخ به سؤالات برنامه‌ریزی");
          }
        } finally {
          setLoading(false);
        }
        return;
      }

      if (choice.id === "manual_planning") {
        void send("منتظر می‌مانم — وقتی سؤالات را پر کردید بگویید ادامه بده");
        return;
      }

      if (choice.id === "user_prompt") {
        void send("برای هر سؤال برنامه‌ریزی تست، یک پاسخ کوتاه پیشنهاد بده تا خودم بنویسم");
        return;
      }

      if (choice.id === "auto_permissions") {
        const recovered = await tryRecoverWizardBlocker(null, "حداقل یک کاربر");
        if (recovered) {
          void send("ادامه بده — دسترسی را تنظیم کردی");
        } else {
          void send("راهنمایی بده چطور دسترسی پیش‌فرض را فعال کنم");
        }
        return;
      }

      if (choice.id === "retry") {
        void send("دوباره تلاش کن");
        return;
      }

      void send(choice.label);
    },
    [loading, uiPlaying, send, playScript]
  );

  if (!agent) return null;

  const showIntro = historyReady && messages.length === 0;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] left-4 z-50 flex w-[min(calc(100vw-2rem),26rem)] flex-col overflow-hidden rounded-2xl border border-brand-200/60 bg-white shadow-card sm:left-5"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: easeOut }}
          >
            <div className="flex items-center gap-3 border-b border-surface-border bg-gradient-to-l from-brand-50 to-white px-4 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-stone-900">راهنمای پلتفرم</p>
                <p className="text-xs text-stone-500">بر اساس صفحه فعلی شما</p>
              </div>
              {graduatedAutonomyEnabled && (
                <Badge variant={effectiveAutonomy() >= 2 ? "success" : "muted"}>
                  خودمختاری: {AUTONOMY_LABELS[effectiveAutonomy()]}
                </Badge>
              )}
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setHistoryOpen((v) => !v);
                    void loadSessions();
                  }}
                  className={cn(
                    "rounded-lg p-1.5 transition-colors",
                    historyOpen
                      ? "bg-brand-100 text-brand-700"
                      : "text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  )}
                  aria-label="تاریخچه گفتگوها"
                  title="تاریخچه"
                >
                  <History className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={startNewConversation}
                  disabled={loading || uiPlaying}
                  className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 disabled:opacity-40"
                  aria-label="گفتگوی جدید"
                  title="گفتگوی جدید"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
                  aria-label="بستن راهنما"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {historyOpen && (
              <div className="max-h-36 overflow-y-auto border-b border-surface-border bg-stone-50/80 px-2 py-2">
                {sessions.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-stone-500">
                    هنوز گفتگویی ندارید — «+» را بزنید.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {sessions.map((s) => {
                      const active = s.threadId === activeThreadId;
                      return (
                        <li key={s.threadId}>
                          <button
                            type="button"
                            disabled={loading || uiPlaying}
                            onClick={() => {
                              void loadThread(s.threadId);
                              setHistoryOpen(false);
                            }}
                            className={cn(
                              "w-full rounded-xl px-3 py-2 text-right text-xs transition-colors",
                              active
                                ? "bg-brand-100 text-brand-900"
                                : "text-stone-700 hover:bg-white"
                            )}
                          >
                            <p className="truncate font-semibold">{s.title}</p>
                            <p className="mt-0.5 text-[10px] text-stone-500">
                              <ClientDateTime iso={s.updatedAt} />
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div ref={scrollRef} className="max-h-[min(50vh,22rem)] space-y-3 overflow-y-auto p-4">
              {!historyReady && messages.length === 0 && (
                <LoadingIndicator size="sm" stage="در حال بارگذاری گفت‌وگو…" />
              )}

              {showIntro && (
                <motion.div
                  className="space-y-4"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: easeOut }}
                >
                  <div className="rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3">
                    <div className="mb-1 flex items-center gap-2 text-brand-700">
                      <MessageCircle className="h-4 w-4" />
                      <span className="text-xs font-semibold">چطور کمک می‌کنم؟</span>
                    </div>
                    <p className="text-sm leading-relaxed text-stone-700">
                      سوال خود را درباره این صفحه بپرسید — در صورت نیاز به بخش مربوط اشاره می‌کنم.
                    </p>
                  </div>
                  <Stagger className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((prompt) => (
                      <StaggerItem key={prompt} variant="scaleIn">
                        <button
                          type="button"
                          className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-800"
                          onClick={() => void send(prompt)}
                        >
                          {prompt}
                        </button>
                      </StaggerItem>
                    ))}
                  </Stagger>
                </motion.div>
              )}

              <Stagger initial={false} className="space-y-3">
                {messages.map((m, i) => {
                  const isUser = m.role === "user";
                  const isLast = i === messages.length - 1;
                  const isEmptyAssistant =
                    m.role === "assistant" && !m.content.trim() && isLast;
                  const showUiTask = uiPlaying && isLast && m.role === "assistant";

                  return (
                    <StaggerItem
                      key={`${i}-${m.role}-${m.content.slice(0, 16)}`}
                      variant={isUser ? "slideRight" : "slideLeft"}
                    >
                      <div className={cn("flex", isUser ? "justify-start" : "justify-end")}>
                        <ChatTurn
                          role={m.role}
                          content={m.content}
                          thinking={m.thinking}
                          uiTask={showUiTask ? m.uiTask ?? (uiProgress ? {
                            label: uiProgress.scriptLabel,
                            step: uiProgress.step,
                            total: uiProgress.total,
                            status: uiProgress.label,
                          } : undefined) : undefined}
                          isStreaming={m.isStreaming}
                          isPending={isEmptyAssistant}
                          loading={loading}
                          phase={llmLoading.phase}
                          statusMessage={llmLoading.statusMessage}
                          liveThinkingContent={llmLoading.thinkingContent}
                          thinkingActive={llmLoading.thinkingActive}
                          thinkingSummary={llmLoading.thinkingSummary}
                          thinkingOpen={thinkingOpen}
                          onThinkingOpenChange={setThinkingOpen}
                          animateEnter={!isUser}
                          onStopUiTask={showUiTask ? stopScript : undefined}
                          bubbleClassName={cn(
                            "px-3.5 py-2.5",
                            isUser ? "bg-brand-100" : "bg-brand-600"
                          )}
                          footer={
                            <>
                              {m.uiAction && m.role === "assistant" && m.content.trim() ? (
                                <SupportActionCard
                                  action={m.uiAction}
                                  onNavigate={(path) => router.push(path)}
                                  className="w-full max-w-[92%]"
                                />
                              ) : null}
                              {m.userChoices?.length && m.role === "assistant" ? (
                                <SupportChoiceBar
                                  choices={m.userChoices}
                                  onSelect={(c) => void handleSupportChoice(c)}
                                  disabled={loading || uiPlaying}
                                  className="max-w-[92%]"
                                />
                              ) : null}
                            </>
                          }
                        />
                      </div>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </div>

            {error && (
              <motion.p
                className="px-4 pb-2 text-xs text-accent-red"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {error}
              </motion.p>
            )}

            <div className="border-t border-surface-border bg-surface-muted/30 p-3">
              <div className="flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  placeholder={
                    uiPlaying ? "دستور جدید یا توقف کار جاری…" : "سوال خود را بنویسید…"
                  }
                  className="min-w-0 flex-1 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-200/60"
                  disabled={loading || !historyReady}
                />
                {uiPlaying ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 shrink-0 px-3 text-xs"
                    onClick={stopScript}
                  >
                    توقف
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="h-11 w-11 shrink-0 p-0 transition-transform active:scale-[0.98]"
                  disabled={loading || !input.trim() || !historyReady}
                  onClick={() => void send()}
                  aria-label="ارسال"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        aria-label="راهنمای پشتیبانی"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom,0px))] left-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow sm:left-5"
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.98 }}
        transition={{ duration: 0.15, ease: easeOut }}
      >
        {open ? <X className="h-6 w-6" /> : <Headphones className="h-6 w-6" />}
      </motion.button>
    </>
  );
}