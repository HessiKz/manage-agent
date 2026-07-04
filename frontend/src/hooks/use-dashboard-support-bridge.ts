"use client";

import { useEffect, useRef } from "react";
import {
  completeAgentTraining,
  fetchAgentDashboard,
  startAgentTraining,
  type DashboardWidgetKind,
} from "@/lib/api";
import { dashboardBridgeHost } from "@/lib/dashboard-bridge-host";
import {
  finishWidgetGeneration,
  generateDashboardWithGuard,
  waitForGeneratingOverlayGone,
} from "@/lib/support-dashboard-generate";
import { registerSupportBridge } from "@/lib/support-automation-bridge";
import { resolveAgentId } from "@/lib/resolve-agent-id";
import { humanizeSupportError } from "@/lib/support-error-text";
import { ensureAgentWidgetEnabled } from "@/lib/support-widget-plan-enable";
import { isWidgetStepSkipped } from "@/lib/support-user-choices";
import { runVisibleWidgetBuild } from "@/lib/support-widget-auto";
import { withSupportTimeout } from "@/lib/support-timeout";
import type { BuilderWidgetType } from "@/lib/widget-builder";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";

const BRIDGE_GENERATE_TIMEOUT_MS = 180_000;
const BRIDGE_APPROVE_TIMEOUT_MS = 60_000;
const BRIDGE_TRAINING_TIMEOUT_MS = 120_000;

let bridgesRegistered = false;

function ensureDashboardBridgesRegistered(): void {
  if (bridgesRegistered) return;
  bridgesRegistered = true;

  registerSupportBridge("dashboard.generate_widget", async (payload, ctx) => {
    await withSupportTimeout(
      runGenerateWidgetBridge(payload, ctx),
      BRIDGE_GENERATE_TIMEOUT_MS,
      "ساخت ویجت بیش از حد طول کشید — «توقف» بزنید یا دوباره تلاش کنید."
    );
  });

  registerSupportBridge("dashboard.approve", async (payload, ctx) => {
    await withSupportTimeout(
      runApproveBridge(payload, ctx),
      BRIDGE_APPROVE_TIMEOUT_MS,
      "تأیید پنل بیش از حد طول کشید."
    );
  });

  registerSupportBridge("training.complete", async (payload, ctx) => {
    await withSupportTimeout(
      runTrainingCompleteBridge(payload, ctx),
      BRIDGE_TRAINING_TIMEOUT_MS,
      "ذخیره آموزش بیش از حد طول کشید."
    );
  });

  registerSupportBridge("training.start", async (payload, ctx) => {
    await withSupportTimeout(
      runTrainingStartBridge(payload, ctx),
      BRIDGE_TRAINING_TIMEOUT_MS,
      "شروع آموزش بیش از حد طول کشید."
    );
  });
}

async function resolveBridgeAgentId(
  payload: Record<string, unknown> | undefined
): Promise<string> {
  const fromPayload = String(payload?.agent_id ?? "").trim();
  const fromSlug = String(payload?.agent_slug ?? "").trim();
  const fromHost = dashboardBridgeHost.agentId?.trim() ?? "";
  try {
    return await resolveAgentId(fromPayload || fromHost, fromSlug);
  } catch (e) {
    throw new Error(humanizeSupportError(e));
  }
}

async function runGenerateWidgetBridge(
  payload: Record<string, unknown> | undefined,
  ctx: SupportPlayerContext
): Promise<void> {
  const id = await resolveBridgeAgentId(payload);
  const widgetType = (String(payload?.widget_type ?? "stat_cards") ||
    "stat_cards") as DashboardWidgetKind;
  const prompt =
    String(payload?.prompt ?? "").trim() || `ویجت ${widgetType} متناسب با نقش این ایجنت`;

  const slug = String(payload?.agent_slug ?? "").trim();
  if (!isWidgetStepSkipped(widgetType) && slug) {
    try {
      await ensureAgentWidgetEnabled(id, slug, widgetType);
    } catch {
      /* user may choose via support bar */
    }
  } else if (isWidgetStepSkipped(widgetType)) {
    throw new Error(`ساخت ${widgetType} توسط کاربر رد شد — مرحله بعد را ادامه دهید.`);
  }

  dashboardBridgeHost.clearGeneratingOverlay?.();
  await waitForGeneratingOverlayGone(25_000);

  try {
    await runVisibleWidgetBuild(id, widgetType, prompt, ctx);
  } catch {
    await ctx.setStatus("سازنده ویجت در دسترس نبود — ساخت مستقیم با محدودیت زمان…");
    await generateDashboardWithGuard(
      id,
      { prompt, widget_type: widgetType, merge_with_existing: true },
      ctx
    );
  }

  await finishWidgetGeneration(id, ctx);
  dashboardBridgeHost.clearGeneratingOverlay?.();
  dashboardBridgeHost.onDraftReady?.();
  dashboardBridgeHost.openDraftPreview?.();
}

async function runApproveBridge(
  payload: Record<string, unknown> | undefined,
  ctx: SupportPlayerContext
): Promise<void> {
  const id = await resolveBridgeAgentId(payload);
  await ctx.setStatus("تأیید پنل");
  await ctx.highlight('[data-ma-support="dashboard-approve"]');
  const btn = document.querySelector(
    '[data-ma-support="dashboard-approve"]'
  ) as HTMLButtonElement | null;
  if (!btn || btn.disabled) {
    throw new Error("دکمه تأیید پنل هنوز آماده نیست — ابتدا ویجت را بسازید.");
  }
  await ctx.click('[data-ma-support="dashboard-approve"]');
  dashboardBridgeHost.onApproved?.();
}

async function runTrainingCompleteBridge(
  payload: Record<string, unknown> | undefined,
  ctx: SupportPlayerContext
): Promise<void> {
  const id = await resolveBridgeAgentId(payload);
  const spec = String(payload?.output_format_spec ?? "").trim();
  if (!spec) throw new Error("اطلاعات آموزش ناقص است");
  await ctx.setStatus("ذخیره آموزش");
  await ctx.highlight('[data-ma-support="training-panel"]');
  await completeAgentTraining(id, {
    messages: [
      { role: "user", content: `فرمت خروجی:\n${spec}` },
      { role: "assistant", content: spec.slice(0, 1500) },
    ],
    notes: spec,
  });
  await ctx.wait(400);
}

async function runTrainingStartBridge(
  payload: Record<string, unknown> | undefined,
  ctx: SupportPlayerContext
): Promise<void> {
  const id = await resolveBridgeAgentId(payload);
  await ctx.setStatus("شروع آموزش");
  await ctx.highlight('[data-ma-support="training-panel"]');
  await startAgentTraining(id);
  await ctx.wait(300);
}

/** Call once near app root — registers global dashboard automation bridges. */
export function useDashboardSupportBridgeRegistry(): void {
  useEffect(() => {
    ensureDashboardBridgesRegistered();
  }, []);
}

type BridgeCaps = {
  enterEditMode?: () => void;
  openBuilder?: (type?: BuilderWidgetType) => void;
  onDraftReady?: () => void;
  onApproved?: () => void;
  clearGeneratingOverlay?: () => void;
  openDraftPreview?: () => void;
};

/** Bind page-local capabilities into the shared bridge host. */
export function useDashboardBridgeHostBinding(
  agentId: string | undefined,
  caps: BridgeCaps
): void {
  const capsRef = useRef(caps);
  capsRef.current = caps;

  useEffect(() => {
    if (!agentId) return;
    dashboardBridgeHost.agentId = agentId;
    return () => {
      if (dashboardBridgeHost.agentId === agentId) {
        dashboardBridgeHost.agentId = null;
      }
    };
  }, [agentId]);

  useEffect(() => {
    const assigned: (keyof BridgeCaps)[] = [];
    const c = capsRef.current;
    if (c.enterEditMode) {
      dashboardBridgeHost.enterEditMode = () => capsRef.current.enterEditMode?.();
      assigned.push("enterEditMode");
    }
    if (c.openBuilder) {
      dashboardBridgeHost.openBuilder = (type) => capsRef.current.openBuilder?.(type);
      assigned.push("openBuilder");
    }
    if (c.onDraftReady) {
      dashboardBridgeHost.onDraftReady = () => capsRef.current.onDraftReady?.();
      assigned.push("onDraftReady");
    }
    if (c.onApproved) {
      dashboardBridgeHost.onApproved = () => capsRef.current.onApproved?.();
      assigned.push("onApproved");
    }
    if (c.clearGeneratingOverlay) {
      dashboardBridgeHost.clearGeneratingOverlay = () =>
        capsRef.current.clearGeneratingOverlay?.();
      assigned.push("clearGeneratingOverlay");
    }
    if (c.openDraftPreview) {
      dashboardBridgeHost.openDraftPreview = () => capsRef.current.openDraftPreview?.();
      assigned.push("openDraftPreview");
    }
    return () => {
      for (const key of assigned) {
        dashboardBridgeHost[key] = null;
      }
    };
  }, []);
}
