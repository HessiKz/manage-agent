"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot } from "lucide-react";
import { runSupportBridge } from "@/lib/support-automation-bridge";
import {
  bindSupportAbortSignal,
  sleepAbortable,
  SupportUiAbortError,
  SupportUiBlockedError,
  throwIfSupportAborted,
} from "@/lib/support-abort";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";
import type { SupportPlayProgress, SupportUiScript, SupportUiStep } from "@/lib/support-ui-script";
import { resolveUiTarget } from "@/lib/ui-ref-registry";
import { easeOut } from "@/components/motion/variants";
import { setNativeFormValue } from "@/lib/support-dom-typing";
import { readCreatedAgentSlug } from "@/lib/support-wizard-mission";
import { assertNoUiBlocker } from "@/lib/ui-snapshot";
import { tryRecoverWizardBlocker } from "@/lib/support-wizard-recovery";
import { tryAutoResolveSupportError } from "@/lib/support-auto-recovery";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

export { SupportUiAbortError, SupportUiBlockedError };

function locationMatchesPathPattern(pattern: string): boolean {
  if (!pattern) return false;
  const { pathname, search, href } = window.location;
  const inLocation =
    pathname.includes(pattern) || search.includes(pattern) || href.includes(pattern);
  if (!inLocation) return false;
  if (pattern === "slug=") {
    const slug =
      new URLSearchParams(search).get("slug")?.trim() || readCreatedAgentSlug();
    return Boolean(slug);
  }
  return true;
}

export type SupportPlayOptions = {
  onProgress?: (progress: SupportPlayProgress) => void;
};

type PlayerApi = {
  playing: boolean;
  playScript: (script: SupportUiScript, opts?: SupportPlayOptions) => Promise<void>;
  stopScript: () => void;
};

const SupportUiPlayerContext = createContext<PlayerApi | null>(null);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function assertClearOrRecoverBlocker(
  ctx: SupportPlayerContext,
  recoveryPass: { count: number }
): Promise<void> {
  try {
    assertNoUiBlocker();
    return;
  } catch (e) {
    if (!(e instanceof SupportUiBlockedError) || recoveryPass.count >= 3) {
      throw e;
    }
    let recovered = await tryRecoverWizardBlocker(ctx, e.blockerText);
    if (!recovered) {
      recovered = await tryAutoResolveSupportError(e.blockerText, ctx);
    }
    if (!recovered) throw e;
    recoveryPass.count += 1;
    await ctx.setStatus(`رفع مانع UI (${recoveryPass.count}/۳)…`);
    await sleep(350);
    assertNoUiBlocker();
  }
}

function resolveStepSelector(step: SupportUiStep): string | undefined {
  if ("ref" in step || "selector" in step) {
    return resolveUiTarget({ ref: step.ref, selector: step.selector });
  }
  return undefined;
}

function centerOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function SupportUiPlayerProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);
  const playingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const throwIfAborted = useCallback((signal: AbortSignal) => {
    if (signal.aborted) throw new SupportUiAbortError();
  }, []);

  const moveCursor = useCallback(
    async (x: number, y: number) => {
      setCursor({ x, y, visible: true });
      await sleep(reducedMotion ? 0 : 320);
    },
    [reducedMotion]
  );

  const showRipple = useCallback(
    async (x: number, y: number) => {
      setRipple({ x, y, key: Date.now() });
      await sleep(reducedMotion ? 0 : 420);
      setRipple(null);
    },
    [reducedMotion]
  );

  const ctx = useMemo<SupportPlayerContext>(
    () => ({
      setStatus,
      navigate: async (path: string) => {
        setStatus("رفتن به صفحه…");
        router.push(path);
        await sleep(reducedMotion ? 200 : 700);
      },
      wait: async (ms: number) => {
        await sleepAbortable(ms);
      },
      highlight: async (selector: string) => {
        const el = document.querySelector(selector);
        if (!el) return;
        el.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
        const { x, y } = centerOf(el);
        await moveCursor(x, y);
        el.classList.add("ma-support-target");
        await sleep(reducedMotion ? 200 : 600);
        el.classList.remove("ma-support-target");
      },
      click: async (selector: string) => {
        const el = document.querySelector(selector);
        if (!el || !(el instanceof HTMLElement)) return;
        const { x, y } = centerOf(el);
        await moveCursor(x, y);
        await showRipple(x, y);
        el.click();
        await sleep(reducedMotion ? 80 : 200);
      },
      typeIntoElement: async (selector: string, text: string) => {
        const el = document.querySelector(selector);
        if (!el || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
          return;
        }
        const { x, y } = centerOf(el);
        await moveCursor(x, y);
        el.focus();
        el.classList.add("ma-support-typing");
        if (reducedMotion) {
          setNativeFormValue(el, text);
        } else {
          let built = "";
          for (const ch of text) {
            built += ch;
            setNativeFormValue(el, built);
            await sleep(28);
          }
        }
        el.classList.remove("ma-support-typing");
        await sleep(120);
      },
      typeWithCallback: async (label, text, onChar) => {
        setStatus(label);
        if (reducedMotion) {
          await onChar(text);
          return;
        }
        let built = "";
        for (const ch of text) {
          built += ch;
          await onChar(built);
          await sleep(24);
        }
      },
    }),
    [moveCursor, reducedMotion, router, showRipple]
  );

  const runStep = useCallback(
    async (step: SupportUiStep, signal: AbortSignal) => {
      throwIfAborted(signal);
      if ("label" in step && step.label) setStatus(step.label);
      switch (step.type) {
        case "navigate":
          await ctx.navigate(step.path);
          break;
        case "wait":
          await ctx.wait(step.ms);
          break;
        case "wait_for_path": {
          const timeout = step.timeout_ms ?? 120_000;
          const start = Date.now();
          while (Date.now() - start < timeout) {
            throwIfAborted(signal);
            if (locationMatchesPathPattern(step.pattern)) break;
            await sleepAbortable(250);
          }
          if (!locationMatchesPathPattern(step.pattern)) {
            const detail =
              step.pattern === "slug="
                ? "صفحهٔ آموزش ایجنت باز نشد — انتشار کامل نشده یا شناسه در آدرس نیست."
                : `صفحهٔ مقصد بارگذاری نشد (${step.pattern})`;
            throw new Error(detail);
          }
          await ctx.wait(800);
          break;
        }
        case "wait_for_dom": {
          const timeout = step.timeout_ms ?? 120_000;
          const resolved = resolveStepSelector(step);
          if (!resolved) throw new Error("مرحله wait_for_dom بدون ref/selector");
          const selectors = resolved.split(",").map((s) => s.trim());
          const start = Date.now();
          while (Date.now() - start < timeout) {
            throwIfAborted(signal);
            const generating = document.querySelector(
              '[data-ma-support="widget-auto-generating"]'
            );
            const found = selectors.some((sel) => document.querySelector(sel));
            if (found && !generating) break;
            await sleepAbortable(280);
          }
          const ready =
            selectors.some((sel) => document.querySelector(sel)) &&
            !document.querySelector('[data-ma-support="widget-auto-generating"]');
          if (!ready) {
            throw new Error(`عنصر رابط کاربری آماده نشد (${resolved})`);
          }
          await ctx.wait(400);
          break;
        }
        case "highlight": {
          const sel = resolveStepSelector(step);
          if (sel) await ctx.highlight(sel);
          break;
        }
        case "click": {
          const sel = resolveStepSelector(step);
          if (sel) await ctx.click(sel);
          break;
        }
        case "type": {
          const sel = resolveStepSelector(step);
          if (sel) await ctx.typeIntoElement(sel, step.text);
          break;
        }
        case "select": {
          const sel = resolveStepSelector(step);
          if (!sel) break;
          const el = document.querySelector(sel);
          if (!(el instanceof HTMLSelectElement)) break;
          const { x, y } = centerOf(el);
          await moveCursor(x, y);
          el.focus();
          el.value = step.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          await sleep(reducedMotion ? 80 : 200);
          break;
        }
        case "bridge":
          throwIfAborted(signal);
          await runSupportBridge(step.action, step.payload, ctx);
          break;
        default:
          break;
      }
      throwIfAborted(signal);
    },
    [ctx, throwIfAborted]
  );

  const stopScript = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      bindSupportAbortSignal(abortRef.current.signal);
    }
    playingRef.current = false;
    setPlaying(false);
    setStatus("");
    setCursor((c) => ({ ...c, visible: false }));
    try {
      sessionStorage.removeItem("ma_support_ui_playing");
    } catch {
      /* ignore */
    }
  }, []);

  const playScript = useCallback(
    async (script: SupportUiScript, opts?: SupportPlayOptions) => {
      if (playingRef.current) {
        stopScript();
        await sleep(80);
      }
      const controller = new AbortController();
      abortRef.current = controller;
      bindSupportAbortSignal(controller.signal);
      playingRef.current = true;
      setPlaying(true);
      try {
        sessionStorage.setItem("ma_support_ui_playing", "1");
      } catch {
        /* private mode */
      }
      setStatus(script.label);
      setCursor((c) => ({ ...c, visible: true }));
      const total = script.steps.length;
      const recoveryPass = { count: 0 };
      try {
        for (let i = 0; i < script.steps.length; i++) {
          throwIfAborted(controller.signal);
          await assertClearOrRecoverBlocker(ctx, recoveryPass);
          const step = script.steps[i];
          const label =
            ("label" in step && step.label) || script.label || "در حال انجام…";
          opts?.onProgress?.({
            step: i + 1,
            total,
            label,
            scriptLabel: script.label,
          });
          await runStep(step, controller.signal);
          await assertClearOrRecoverBlocker(ctx, recoveryPass);
        }
      } catch (e) {
        throw e;
      } finally {
        bindSupportAbortSignal(null);
        setPlaying(false);
        setStatus("");
        setCursor((c) => ({ ...c, visible: false }));
        playingRef.current = false;
        abortRef.current = null;
        try {
          sessionStorage.removeItem("ma_support_ui_playing");
        } catch {
          /* ignore */
        }
      }
    },
    [runStep, stopScript, throwIfAborted]
  );

  const api = useMemo(
    () => ({ playing, playScript, stopScript }),
    [playing, playScript, stopScript]
  );

  return (
    <SupportUiPlayerContext.Provider value={api}>
      {children}
      <AnimatePresence>
        {playing && (
          <motion.div
            className="fixed bottom-24 left-1/2 z-[9999] flex max-w-md -translate-x-1/2 items-center gap-2 rounded-2xl border border-brand-200 bg-white/95 px-4 py-2.5 shadow-card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: easeOut }}
            role="status"
            aria-live="polite"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-stone-900">ایجنت پشتیبان</p>
              <p className="truncate text-xs text-stone-600">{status || "در حال کار…"}</p>
            </div>
            <LoadingSpinner />
            <button
              type="button"
              className="pointer-events-auto shrink-0 rounded-lg border border-accent-red/30 bg-accent-red/10 px-2 py-1 text-xs font-semibold text-accent-red hover:bg-accent-red/15"
              onClick={stopScript}
            >
              توقف
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {cursor.visible && (
        <motion.div
          className="pointer-events-none fixed z-[10000] h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-600 bg-brand-400/40 shadow-md"
          animate={{ left: cursor.x, top: cursor.y }}
          transition={{ duration: reducedMotion ? 0 : 0.32, ease: easeOut }}
          aria-hidden
        />
      )}

      {ripple && (
        <motion.span
          key={ripple.key}
          className="pointer-events-none fixed z-[10000] h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-500 bg-brand-400/25"
          style={{ left: ripple.x, top: ripple.y }}
          initial={{ scale: 0.4, opacity: 0.9 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 0.45, ease: easeOut }}
          aria-hidden
        />
      )}
    </SupportUiPlayerContext.Provider>
  );
}

export function useSupportUiPlayer(): PlayerApi {
  const ctx = useContext(SupportUiPlayerContext);
  if (!ctx) {
    throw new Error("useSupportUiPlayer must be used within SupportUiPlayerProvider");
  }
  return ctx;
}