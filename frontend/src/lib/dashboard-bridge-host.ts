/** Mutable host for dashboard support bridges — overview + editor panels bind capabilities. */

import type { BuilderWidgetType } from "@/lib/widget-builder";

export type DashboardBridgeHost = {
  agentId: string | null;
  enterEditMode: (() => void) | null;
  openBuilder: ((type?: BuilderWidgetType) => void) | null;
  onDraftReady: (() => void) | null;
  onApproved: (() => void) | null;
  /** Clears the full-page «در حال ساخت پیش‌نویس ویجت» overlay (auto_generate). */
  clearGeneratingOverlay: (() => void) | null;
  openDraftPreview: (() => void) | null;
};

export const dashboardBridgeHost: DashboardBridgeHost = {
  agentId: null,
  enterEditMode: null,
  openBuilder: null,
  onDraftReady: null,
  onApproved: null,
  clearGeneratingOverlay: null,
  openDraftPreview: null,
};

export function bindDashboardBridgeHost(patch: Partial<DashboardBridgeHost>): void {
  Object.assign(dashboardBridgeHost, patch);
}

export function clearDashboardBridgeHost(keys: (keyof DashboardBridgeHost)[]): void {
  for (const key of keys) {
    if (key === "agentId") {
      dashboardBridgeHost.agentId = null;
    } else {
      dashboardBridgeHost[key] = null;
    }
  }
}
