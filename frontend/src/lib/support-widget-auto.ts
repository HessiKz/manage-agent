import { dashboardBridgeHost } from "@/lib/dashboard-bridge-host";
import {
  builderTypeFromBackendKind,
  type BuilderWidgetType,
} from "@/lib/widget-builder";
import { sleepAbortable, throwIfSupportAborted } from "@/lib/support-abort";
import {
  generateDashboardWithGuard,
  waitForWidgetBuilderPreview,
} from "@/lib/support-dashboard-generate";
import { waitForDomSelector } from "@/lib/support-automation-bridge";
import type { DashboardWidgetKind } from "@/lib/api";
import type { SupportPlayerContext } from "@/lib/support-ui-player-context";

async function ensureOverviewTab(ctx: SupportPlayerContext): Promise<void> {
  const tab = document.querySelector('[data-ma-guide="agent-tab-overview"]');
  if (tab instanceof HTMLElement) {
    await ctx.highlight('[data-ma-guide="agent-tab-overview"]');
    tab.click();
    await ctx.wait(450);
  }
}

async function waitForEditorCapabilities(timeoutMs = 45_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    throwIfSupportAborted();
    if (dashboardBridgeHost.openBuilder) return;
    await sleepAbortable(250);
  }
}

async function ensureDashboardPanel(ctx: SupportPlayerContext): Promise<void> {
  dashboardBridgeHost.enterEditMode?.();
  await ctx.wait(400);
  await waitForEditorCapabilities();
  await waitForDomSelector('[data-ma-support="dashboard-panel"]', 60_000, 250);
}

export async function runVisibleWidgetBuild(
  agentId: string,
  widgetType: DashboardWidgetKind,
  prompt: string,
  ctx: SupportPlayerContext
): Promise<void> {
  dashboardBridgeHost.clearGeneratingOverlay?.();
  await ctx.setStatus("آماده‌سازی پنل ایجنت…");
  await ensureOverviewTab(ctx);
  await ensureDashboardPanel(ctx);

  const builderType: BuilderWidgetType =
    builderTypeFromBackendKind(widgetType) ?? "stat_card";

  await ctx.setStatus(`مرحله ۱ از ۳: باز کردن سازنده ویجت (${widgetType})`);
  dashboardBridgeHost.openBuilder?.(builderType);
  await waitForDomSelector('[data-ma-support="widget-builder-modal"]', 15_000, 200);

  const typeBtn = document.querySelector(
    `[data-ma-support="widget-builder-type-${builderType}"]`
  );
  if (typeBtn instanceof HTMLElement) {
    await ctx.setStatus("مرحله ۱ از ۳: انتخاب نوع ویجت");
    await ctx.highlight(`[data-ma-support="widget-builder-type-${builderType}"]`);
    typeBtn.click();
    await ctx.wait(400);
  }

  await ctx.setStatus("مرحله ۲ از ۳: ساخت پیش‌نمایش ویجت");
  await ctx.highlight('[data-ma-support="widget-builder-generate"]');
  const generateBtn = document.querySelector(
    '[data-ma-support="widget-builder-generate"]'
  ) as HTMLButtonElement | null;
  if (generateBtn && !generateBtn.disabled) {
    generateBtn.click();
  } else {
    await generateDashboardWithGuard(
      agentId,
      { prompt, widget_type: widgetType, merge_with_existing: true },
      ctx
    );
    dashboardBridgeHost.onDraftReady?.();
    return;
  }

  await waitForWidgetBuilderPreview();

  await ctx.setStatus("مرحله ۳ از ۳: تأیید پیش‌نمایش ویجت");
  await ctx.highlight('[data-ma-support="widget-builder-approve"]');
  const approveBtn = document.querySelector(
    '[data-ma-support="widget-builder-approve"]'
  ) as HTMLButtonElement | null;
  if (approveBtn && !approveBtn.disabled) {
    approveBtn.click();
    await sleepAbortable(600);
  }
}
