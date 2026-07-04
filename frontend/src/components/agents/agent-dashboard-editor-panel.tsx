"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AgentDashboardView } from "@/components/agents/agent-dashboard-view";
import { WidgetCreateChatModal } from "@/components/agents/widget-create-chat-modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  approveAgentDashboard,
  fetchAgentDashboard,
  patchAgentDashboardWidgets,
  type DashboardWidgetKind,
} from "@/lib/api";
import { handleApiError } from "@/lib/api-error-handler";
import { applyWidgetHighlight, invalidateAgentDashboardQueries } from "@/lib/dashboard-draft";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { parseWidgetPlan } from "@/lib/widget-plan";
import {
  backendKindForBuilder,
  type BuilderWidgetType,
} from "@/lib/widget-builder";
import {
  syncWidgetBuilderUrl,
  useUrlParams,
  WIDGET_BUILDER_URL_KEYS,
} from "@/lib/url-search-params";
import { useDashboardBridgeHostBinding } from "@/hooks/use-dashboard-support-bridge";
import type { Agent } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type Props = {
  agentId: string;
  agent?: Agent;
  showAdminTest?: boolean;
  mode: "review" | "edit";
  onApproved?: () => void;
  initialShowDraft?: boolean;
  autoOpenWidgetBuilder?: boolean;
  builderInitialType?: BuilderWidgetType;
  highlightWidget?: string | null;
  /** When false, widget builder open/close won't touch the URL (e.g. testing wizard). */
  syncUrl?: boolean;
  onWidgetBuilderClose?: () => void;
};

export function AgentDashboardEditorPanel({
  agentId,
  agent,
  showAdminTest = false,
  mode,
  onApproved,
  initialShowDraft = false,
  autoOpenWidgetBuilder = false,
  builderInitialType: builderInitialTypeProp,
  highlightWidget,
  syncUrl = true,
  onWidgetBuilderClose,
}: Props) {
  const qc = useQueryClient();
  const { replaceParams, clearParams } = useUrlParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDraft, setShowDraft] = useState(initialShowDraft || mode === "review");
  const [removingWidget, setRemovingWidget] = useState<DashboardWidgetKind | null>(null);
  const [removingStatCardId, setRemovingStatCardId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [builderInitialType, setBuilderInitialType] = useState<BuilderWidgetType | undefined>(
    builderInitialTypeProp
  );
  const [widgetsDirty, setWidgetsDirty] = useState(false);

  const { data: liveDashboard } = useQuery({
    queryKey: ["agent-dashboard", agentId, "live"],
    queryFn: () => fetchAgentDashboard(agentId, false),
  });

  useEffect(() => {
    if (autoOpenWidgetBuilder) {
      setCreateOpen(true);
      if (builderInitialTypeProp) setBuilderInitialType(builderInitialTypeProp);
    }
  }, [autoOpenWidgetBuilder, builderInitialTypeProp]);

  const widgetPlan = parseWidgetPlan(agent?.config_json, agent?.department, agent?.description);

  const { data: dashboard, isLoading, refetch } = useQuery({
    queryKey: ["agent-dashboard", agentId, showDraft ? "draft" : "live"],
    queryFn: () => fetchAgentDashboard(agentId, showDraft),
  });

  useEffect(() => {
    if (!dashboard || !highlightWidget) return;
    const timer = window.setTimeout(() => applyWidgetHighlight(highlightWidget), 350);
    return () => window.clearTimeout(timer);
  }, [dashboard, highlightWidget]);

  async function removeWidget(kind: DashboardWidgetKind) {
    setRemovingWidget(kind);
    setError(null);
    setShowDraft(true);
    setWidgetsDirty(true);
    try {
      await patchAgentDashboardWidgets(agentId, { remove_widgets: [kind] });
      await refetch();
    } catch (e: unknown) {
      setError(handleApiError(e, { toast: true }).message);
    } finally {
      setRemovingWidget(null);
    }
  }

  async function removeStatCard(cardId: string) {
    setRemovingStatCardId(cardId);
    setError(null);
    setShowDraft(true);
    setWidgetsDirty(true);
    try {
      await patchAgentDashboardWidgets(agentId, { remove_stat_card_ids: [cardId] });
      await refetch();
    } catch (e: unknown) {
      setError(handleApiError(e, { toast: true }).message);
    } finally {
      setRemovingStatCardId(null);
    }
  }

  async function enableWidget(kind: DashboardWidgetKind) {
    setBusy(true);
    setError(null);
    try {
      await patchAgentDashboardWidgets(agentId, { enable_widgets: [kind] });
      setShowDraft(true);
      setWidgetsDirty(true);
      await refetch();
    } catch (e: unknown) {
      setError(handleApiError(e, { toast: true }).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      await approveAgentDashboard(agentId, {
        scheduleValidation: mode === "review",
      });
      await qc.invalidateQueries({ queryKey: ["agent-dashboard", agentId] });
      if (syncUrl) {
        clearParams(WIDGET_BUILDER_URL_KEYS);
      }
      onApproved?.();
    } catch (e: unknown) {
      setError(handleApiError(e, { toast: true, toastTitle: "خطا در تأیید پنل" }).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveEdits() {
    setBusy(true);
    setError(null);
    try {
      const needsApprove =
        showDraft || widgetsDirty || Boolean(liveDashboard?.has_pending_draft);
      if (needsApprove) {
        await approveAgentDashboard(agentId, { scheduleValidation: false });
      }
      await qc.invalidateQueries({ queryKey: ["agent-dashboard", agentId] });
      if (syncUrl) {
        clearParams(WIDGET_BUILDER_URL_KEYS);
      }
      setWidgetsDirty(false);
      toast.success("تغییرات پنل ذخیره شد");
      onApproved?.();
    } catch (e: unknown) {
      setError(handleApiError(e, { toast: true, toastTitle: "خطا در ذخیره پنل" }).message);
    } finally {
      setBusy(false);
    }
  }

  function closeWidgetBuilder() {
    setCreateOpen(false);
    setBuilderInitialType(undefined);
    if (syncUrl) {
      clearParams(WIDGET_BUILDER_URL_KEYS);
    }
    onWidgetBuilderClose?.();
  }

  const openBuilder = useCallback(
    (type?: BuilderWidgetType) => {
      setBuilderInitialType(type);
      setCreateOpen(true);
      if (syncUrl) {
        syncWidgetBuilderUrl(
          replaceParams,
          true,
          type ? backendKindForBuilder(type) : undefined
        );
      }
    },
    [replaceParams, syncUrl]
  );

  useDashboardBridgeHostBinding(agentId, {
    openBuilder,
    onDraftReady: () => {
      setShowDraft(true);
      void refetch();
    },
    onApproved,
  });

  return (
    <>
      <Stagger className="space-y-4" replayOnRoute>
        <StaggerItem variant="fadeIn">
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm leading-relaxed text-stone-700">
            <p className="font-semibold text-stone-900">
              {mode === "review" ? "بازبینی پنل ایجنت" : "سفارشی‌سازی پنل"}
            </p>
            <p className="mt-1">
              هر کارت شاخص یک ویجت جداست. با + ویجت بسازید — AI پیش‌نمایش می‌دهد و شما تأیید یا
              رد می‌کنید.
            </p>
            <p className="mt-2 text-xs text-stone-600">
              ویجت‌ها را هر زمان با دکمه «+» اضافه یا حذف کنید.
            </p>
          </div>
        </StaggerItem>

        {isLoading || !dashboard ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <StaggerItem variant="scaleIn">
            <div data-ma-support="dashboard-panel">
            <AgentDashboardView
              dashboard={dashboard}
              preview={showDraft}
              editable
              onRemoveWidget={removeWidget}
              onRemoveStatCard={removeStatCard}
              onEnableWidget={enableWidget}
              onCreateCustomWidget={openBuilder}
              removingWidget={removingWidget}
              removingStatCardId={removingStatCardId}
              widgetPlan={widgetPlan}
            />
            </div>
          </StaggerItem>
        )}

        {error && (
          <p className="rounded-xl border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-sm text-accent-red">
            {error}
          </p>
        )}

        <StaggerItem variant="scaleIn">
          {mode === "review" ? (
            <Button
              className="w-full"
              disabled={busy || isLoading}
              onClick={approve}
              data-ma-support="dashboard-approve"
            >
              {busy ? (
                <LoadingSpinner />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              تأیید پنل و شروع تست
            </Button>
          ) : (
            <Button
              className="w-full"
              variant="secondary"
              disabled={busy || isLoading}
              onClick={saveEdits}
            >
              {busy ? <LoadingSpinner /> : "ذخیره و بازگشت"}
            </Button>
          )}
        </StaggerItem>
      </Stagger>

      <WidgetCreateChatModal
        agentId={agentId}
        agent={agent}
        dashboard={dashboard}
        showAdminTest={showAdminTest}
        initialType={builderInitialType}
        open={createOpen}
        onClose={closeWidgetBuilder}
        onCreated={async () => {
          setShowDraft(true);
          setWidgetsDirty(true);
          await invalidateAgentDashboardQueries(qc, agentId);
          await qc.invalidateQueries({ queryKey: ["agent", agent?.slug] });
        }}
      />
    </>
  );
}