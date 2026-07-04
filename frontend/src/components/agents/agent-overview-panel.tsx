"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RefreshCw, Settings2 } from "lucide-react";
import { AgentKnowledgeSummary } from "@/components/agents/agent-knowledge-summary";
import { AgentDashboardEditorPanel } from "@/components/agents/agent-dashboard-editor-panel";
import { AgentDashboardView } from "@/components/agents/agent-dashboard-view";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAgentDashboard, generateAgentDashboard } from "@/lib/api";
import {
  SUPPORT_DASHBOARD_GENERATE_MS,
  waitForDashboardDraft,
} from "@/lib/support-dashboard-generate";
import {
  applyWidgetHighlight,
  invalidateAgentDashboardQueries,
} from "@/lib/dashboard-draft";
import {
  backendKindForBuilder,
  builderTypeFromBackendKind,
  defaultWidgetGeneratePrompt,
  type BuilderWidgetType,
} from "@/lib/widget-builder";
import {
  DRAFT_PREVIEW_URL_KEYS,
  useUrlParams,
  WIDGET_BUILDER_URL_KEYS,
} from "@/lib/url-search-params";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { useDashboardBridgeHostBinding } from "@/hooks/use-dashboard-support-bridge";
import type { Agent } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type Props = {
  agentId: string;
  agent?: Agent;
  editable?: boolean;
  showAdminTest?: boolean;
  draftPreview?: boolean;
  autoGenerateWidget?: boolean;
  autoOpenWidgetBuilder?: boolean;
  widgetBuilderType?: string;
  widgetPrompt?: string | null;
  highlightWidget?: string | null;
  onOpenKnowledge?: () => void;
};

export function AgentOverviewPanel({
  agentId,
  agent,
  editable,
  showAdminTest = false,
  draftPreview = false,
  autoGenerateWidget = false,
  autoOpenWidgetBuilder = false,
  widgetBuilderType,
  widgetPrompt,
  highlightWidget,
  onOpenKnowledge,
}: Props) {
  const { replaceParams, clearParams } = useUrlParams();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [generatingWidget, setGeneratingWidget] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [viewDraft, setViewDraft] = useState(draftPreview);
  const [draftRevision, setDraftRevision] = useState(0);
  const [refreshingDraft, setRefreshingDraft] = useState(false);
  const autoGenerateRan = useRef(false);
  const autoGenerateInFlight = useRef(false);

  const clearGeneratingOverlay = useCallback(() => {
    autoGenerateInFlight.current = false;
    setGeneratingWidget(false);
  }, []);

  const builderInitialType: BuilderWidgetType | undefined =
    builderTypeFromBackendKind(widgetBuilderType ?? "") ??
    (widgetBuilderType === "stat_card" ? "stat_card" : undefined);

  useEffect(() => {
    setViewDraft(draftPreview);
    if (draftPreview) {
      setDraftRevision((n) => n + 1);
    }
  }, [draftPreview]);

  useEffect(() => {
    if (autoOpenWidgetBuilder && editable && !autoGenerateWidget) {
      setEditing(true);
    }
  }, [autoOpenWidgetBuilder, autoGenerateWidget, editable]);

  useEffect(() => {
    if (!editing) {
      void invalidateAgentDashboardQueries(qc, agentId);
    }
  }, [editing, agentId, qc]);

  const showingDraft = viewDraft || draftPreview;

  const { data: liveDashboard, isLoading: liveLoading } = useQuery({
    queryKey: ["agent-dashboard", agentId, "live"],
    queryFn: () => fetchAgentDashboard(agentId, false),
    staleTime: 0,
  });

  const pendingDraft = Boolean(liveDashboard?.has_pending_draft);

  const {
    data: draftDashboard,
    isLoading: draftLoading,
    isFetching: draftFetching,
  } = useQuery({
    queryKey: ["agent-dashboard", agentId, "draft", draftRevision],
    queryFn: () => fetchAgentDashboard(agentId, true),
    enabled: showingDraft,
    staleTime: 0,
    gcTime: 0,
  });

  const reloadDraftPreview = useCallback(async () => {
    setRefreshingDraft(true);
    try {
      setDraftRevision((n) => n + 1);
      await invalidateAgentDashboardQueries(qc, agentId);
    } finally {
      setRefreshingDraft(false);
    }
  }, [agentId, qc]);

  const openDraftPreview = useCallback(async () => {
    setViewDraft(true);
    setDraftRevision((n) => n + 1);
    replaceParams({ set: { tab: "overview", draft: "1" } });
    await invalidateAgentDashboardQueries(qc, agentId);
  }, [agentId, qc, replaceParams]);

  useDashboardBridgeHostBinding(agentId, {
    enterEditMode: () => setEditing(true),
    clearGeneratingOverlay,
    openDraftPreview: () => void openDraftPreview(),
  });

  const closeDraftPreview = useCallback(async () => {
    setViewDraft(false);
    clearParams(DRAFT_PREVIEW_URL_KEYS);
    await invalidateAgentDashboardQueries(qc, agentId);
  }, [agentId, clearParams, qc]);

  const exitEditMode = useCallback(async () => {
    setEditing(false);
    clearParams(WIDGET_BUILDER_URL_KEYS);
    await invalidateAgentDashboardQueries(qc, agentId);
    await qc.invalidateQueries({ queryKey: ["agent", agent?.slug] });
  }, [agent?.slug, agentId, clearParams, qc]);

  useEffect(() => {
    if (!autoGenerateWidget) {
      autoGenerateRan.current = false;
      autoGenerateInFlight.current = false;
      setGeneratingWidget(false);
      return;
    }
    if (!editable || !agent?.id || autoGenerateRan.current || autoGenerateInFlight.current) {
      return;
    }
    if (liveLoading) return;

    autoGenerateRan.current = true;

    if (pendingDraft) {
      void openDraftPreview();
      clearParams([...WIDGET_BUILDER_URL_KEYS, "auto_generate", "widget_prompt"]);
      return;
    }

    const builderType = builderInitialType ?? "stat_card";
    const backendKind = backendKindForBuilder(builderType);
    const prompt =
      widgetPrompt?.trim() || defaultWidgetGeneratePrompt(agent.name, builderType);

    autoGenerateInFlight.current = true;
    setGeneratingWidget(true);
    setGenerateError(null);

    const controller = new AbortController();
    const watchdog = window.setTimeout(() => controller.abort(), SUPPORT_DASHBOARD_GENERATE_MS);

    void (async () => {
      try {
        await generateAgentDashboard(
          agentId,
          {
            prompt,
            widget_type: backendKind,
            merge_with_existing: true,
          },
          { signal: controller.signal }
        );
        const hasDraft = await waitForDashboardDraft(agentId, 20_000);
        if (!hasDraft) {
          throw new Error("پیش‌نویس ویجت ذخیره نشد");
        }
        await invalidateAgentDashboardQueries(qc, agentId);
        setViewDraft(true);
        setDraftRevision((n) => n + 1);
        replaceParams({
          set: {
            tab: "overview",
            draft: "1",
            highlight_widget: backendKind,
          },
          delete: [...WIDGET_BUILDER_URL_KEYS, "auto_generate", "widget_prompt"],
        });
      } catch {
        setGenerateError("ساخت خودکار ویجت ناموفق بود — فرم دستی باز می‌شود.");
        setEditing(true);
        clearParams(["auto_generate", "widget_prompt"]);
      } finally {
        window.clearTimeout(watchdog);
        autoGenerateInFlight.current = false;
        setGeneratingWidget(false);
      }
    })();

    return () => {
      controller.abort();
      window.clearTimeout(watchdog);
      autoGenerateInFlight.current = false;
      setGeneratingWidget(false);
    };
  }, [
    agent?.id,
    agent?.name,
    agentId,
    autoGenerateWidget,
    builderInitialType,
    clearParams,
    editable,
    liveLoading,
    openDraftPreview,
    pendingDraft,
    qc,
    replaceParams,
    widgetPrompt,
  ]);

  const dashboard = showingDraft ? draftDashboard : liveDashboard;
  const isLoading = showingDraft ? draftLoading : liveLoading;

  useEffect(() => {
    if (!dashboard || !highlightWidget || !showingDraft) return;
    const timer = window.setTimeout(() => applyWidgetHighlight(highlightWidget), 400);
    return () => window.clearTimeout(timer);
  }, [dashboard, highlightWidget, showingDraft, draftRevision]);

  if (generatingWidget) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-16 text-center"
        data-ma-support="widget-auto-generating"
      >
        <LoadingSpinner />
        <p className="text-sm font-medium text-stone-800">در حال ساخت پیش‌نویس ویجت…</p>
        <p className="max-w-sm text-xs text-stone-500">
          کارت‌های شاخص بر اساس مشخصات ایجنت تولید می‌شوند — حداکثر حدود ۹۰ ثانیه.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-2 text-xs"
          onClick={() => {
            clearGeneratingOverlay();
            setGenerateError("ساخت خودکار لغو شد — می‌توانید از «سفارشی‌سازی پنل» ادامه دهید.");
            setEditing(true);
            clearParams(["auto_generate", "widget_prompt"]);
          }}
        >
          لغو و ادامه دستی
        </Button>
      </div>
    );
  }

  if (editing && editable) {
    return (
      <AgentDashboardEditorPanel
        agentId={agentId}
        agent={agent}
        showAdminTest={showAdminTest}
        mode="edit"
        initialShowDraft={showingDraft || pendingDraft}
        autoOpenWidgetBuilder={autoOpenWidgetBuilder}
        builderInitialType={builderInitialType}
        highlightWidget={highlightWidget}
        onApproved={() => void exitEditMode()}
      />
    );
  }

  if (isLoading || !dashboard) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-40" />
        <Skeleton className="h-56" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {generateError && (
        <p className="rounded-xl border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
          {generateError}
        </p>
      )}
      {showingDraft && (
        <Stagger replayOnRoute>
          <StaggerItem variant="fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
              <div>
                <p className="font-semibold">پیش‌نمایش ویجت</p>
                <p className="mt-0.5 text-stone-700">
                  {draftFetching || refreshingDraft
                    ? "در حال بارگذاری آخرین پیش‌نویس…"
                    : dashboard.is_draft_preview
                      ? "این همان پیش‌نویس ذخیره‌شده است — برای انتشار نهایی «تأیید در سفارشی‌سازی» را بزنید."
                      : dashboard.draft_unavailable
                        ? "پیش‌نویسی یافت نشد؛ ممکن است قبلاً تأیید یا حذف شده باشد."
                        : "در حال نمایش پیش‌نویس…"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  variant="secondary"
                  className="gap-2"
                  disabled={refreshingDraft || draftFetching}
                  onClick={() => void reloadDraftPreview()}
                >
                  <RefreshCw
                    className={`h-4 w-4 ${refreshingDraft || draftFetching ? "animate-spin" : ""}`}
                  />
                  بروزرسانی
                </Button>
                <Button variant="secondary" onClick={() => void closeDraftPreview()}>
                  بازگشت به نسخه منتشرشده
                </Button>
              </div>
            </div>
          </StaggerItem>
        </Stagger>
      )}

      {!showingDraft && pendingDraft && (
        <Stagger replayOnRoute>
          <StaggerItem variant="fadeIn">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
              <div>
                <p className="font-semibold">پیش‌نویس ویجت ذخیره شده</p>
                <p className="mt-0.5 text-amber-900/80">
                  ویجت ساخته‌شده هنوز منتشر نشده — با «مشاهده پیش‌نویس» همان را می‌بینید.
                </p>
              </div>
              <Button className="shrink-0 gap-2" onClick={() => void openDraftPreview()}>
                <Eye className="h-4 w-4" />
                مشاهده پیش‌نویس
              </Button>
            </div>
          </StaggerItem>
        </Stagger>
      )}

      {editable && (
        <Stagger replayOnRoute>
          <StaggerItem variant="fadeIn">
            <div className="flex flex-wrap justify-end gap-2">
              {pendingDraft && (
                <Button
                  variant="secondary"
                  className="gap-2"
                  onClick={() => void openDraftPreview()}
                >
                  <Eye className="h-4 w-4" />
                  {showingDraft ? "بروزرسانی پیش‌نمایش" : "پیش‌نمایش"}
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Settings2 className="h-4 w-4" />
                سفارشی‌سازی پنل
              </Button>
            </div>
          </StaggerItem>
        </Stagger>
      )}

      <AgentDashboardView
        dashboard={dashboard}
        showReviewActions
        preview={showingDraft && !dashboard.draft_unavailable}
      />

      {agent && (
        <Card data-ma-support="agent-dashboard-knowledge">
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-stone-900">پایگاه دانش</h3>
              <p className="mt-0.5 text-xs text-stone-500">
                داده‌ها و فایل‌هایی که این ایجنت برای پاسخ‌گویی استفاده می‌کند.
              </p>
            </div>
            {onOpenKnowledge && (
              <Button type="button" variant="secondary" className="text-xs" onClick={onOpenKnowledge}>
                مدیریت کامل
              </Button>
            )}
          </CardHeader>
          <CardBody>
            <AgentKnowledgeSummary agent={agent} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}