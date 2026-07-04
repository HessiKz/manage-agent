/** Detect incomplete agent-create wizard missions and auto-heal with wizard.create bridge. */

import type { SupportUiScript } from "@/lib/support-ui-script";

const KINDS = ["chat", "worker", "supervisor", "custom"] as const;
const WIZARD_PAYLOAD_KEY = "ma_wizard_create_payload";

export function scriptHasWizardCreateBridge(script?: SupportUiScript): boolean {
  return Boolean(
    script?.steps.some(
      (s) => s.type === "bridge" && "action" in s && s.action === "wizard.create"
    )
  );
}

function hasSupportMarker(marker: string): boolean {
  return Boolean(document.querySelector(`[data-ma-support="${marker}"]`));
}

/** Publish / training already started — never re-walk steps 1–5. */
export function isWizardPublishOrTestingUi(): boolean {
  return (
    hasSupportMarker("wizard-bootstrap-loading") ||
    hasSupportMarker("training-panel") ||
    hasSupportMarker("wizard-planning-questions") ||
    hasSupportMarker("wizard-testing-complete") ||
    hasSupportMarker("wizard-testing-error") ||
    hasSupportMarker("dashboard-panel")
  );
}

/**
 * Active wizard step via aria-current (stable). Do not use Tailwind color classes —
 * completed steps use emerald and can leave zero brand matches → false index 0.
 */
export function readWizardStepIndex(): number {
  const active = document.querySelector(
    '[data-ma-support^="wizard-step-tab-"][aria-current="step"]'
  );
  const match = active?.getAttribute("data-ma-support")?.match(/wizard-step-tab-(\d+)/);
  if (match) return parseInt(match[1], 10);
  return 0;
}

function readWizardStepCount(): number {
  return document.querySelectorAll('[data-ma-support^="wizard-step-tab-"]').length;
}

/** Steps 1–5 (tabs before the last «تست» step). */
export function isWizardOnEarlySteps(): boolean {
  const stepCount = readWizardStepCount();
  if (stepCount === 0) return true;
  return readWizardStepIndex() < stepCount - 1;
}

/**
 * Hard stop: agent already persisted or testing UI is up.
 * Any create-walk (setStep(0) + new agent) is forbidden.
 *
 * Stale ?slug= or session on early wizard steps must NOT skip to step 6.
 */
export function shouldBlockWizardCreateWalk(): boolean {
  if (typeof window === "undefined") return false;
  if (isWizardOnEarlySteps() && !isWizardPublishOrTestingUi()) return false;
  if (readWizardSlugFromUrl()) return true;
  if (isWizardPublishOrTestingUi()) return true;
  const stepCount = readWizardStepCount();
  if (stepCount > 0 && readWizardStepIndex() >= stepCount - 1) return true;
  return false;
}

/** True while create wizard is open before agent persist (no slug yet). */
export function isWizardCreateMissionIncomplete(pathname: string): boolean {
  if (!pathname.startsWith("/agents/create")) return false;

  // Once publish/testing started or slug exists — NEVER treat as create-incomplete.
  if (shouldBlockWizardCreateWalk()) return false;

  const tabs = document.querySelectorAll('[data-ma-support^="wizard-step-tab-"]');
  if (!tabs.length) return false;
  const active = readWizardStepIndex();
  return active < tabs.length - 1;
}

/** True after agent persist until testing pipeline finishes. */
export function isWizardTestingMissionIncomplete(pathname: string): boolean {
  if (!pathname.startsWith("/agents/create")) return false;

  if (hasSupportMarker("wizard-testing-complete")) return false;
  if (hasSupportMarker("wizard-testing-error")) return false;

  const slug = readCreatedAgentSlug();
  if (!slug) return false;

  if (hasSupportMarker("wizard-planning-questions")) return true;
  if (hasSupportMarker("wizard-bootstrap-loading")) return true;
  if (hasSupportMarker("training-panel")) return true;

  const stepCount = readWizardStepCount();
  if (stepCount > 0 && readWizardStepIndex() < stepCount - 1) {
    return false;
  }

  return true;
}

export function readWizardFormSnapshot(): Record<string, unknown> | null {
  const name = (
    document.querySelector('[data-ma-support="wizard-name"]') as HTMLInputElement | null
  )?.value?.trim();
  if (!name) return null;

  const description =
    (
      document.querySelector('[data-ma-support="wizard-description"]') as
        | HTMLTextAreaElement
        | null
    )?.value?.trim() ?? "";

  const department =
    (
      document.querySelector('[data-ma-support="wizard-department"]') as HTMLSelectElement | null
    )?.value?.trim() || "ops";

  let kind = "chat";
  for (const k of KINDS) {
    const btn = document.querySelector(`[data-ma-support="wizard-kind-${k}"]`);
    if (
      btn?.classList.contains("border-brand-500") ||
      btn?.querySelector(".bg-brand-600")
    ) {
      kind = k;
      break;
    }
  }

  return {
    name,
    description,
    department,
    kind,
    output_format_spec: description,
  };
}

/** Persist create payload — form fields unmount on the testing step. */
export function storeWizardCreatePayload(payload: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(WIZARD_PAYLOAD_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readStoredWizardCreatePayload(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_PAYLOAD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Payload for continue_testing. Form DOM is gone on the testing step, so prefer
 * stored create payload + slug — never require visible name/description fields.
 */
export function buildContinueTestingPayload(
  slug?: string,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  const resolvedSlug = (slug ?? readCreatedAgentSlug()).trim();
  const stored = readStoredWizardCreatePayload() ?? {};
  const live = readWizardFormSnapshot() ?? {};
  const name =
    String(extra?.name ?? live.name ?? stored.name ?? "").trim() || "ایجنت";
  return {
    ...stored,
    ...live,
    ...extra,
    name,
    agent_slug: resolvedSlug,
  };
}

/** Full wizard → training bridge (matches backend platform_create_agent). */
export function buildWizardCreateBridgeScript(
  payload: Record<string, unknown>
): SupportUiScript {
  storeWizardCreatePayload(payload);
  const name = String(payload.name ?? "ایجنت");
  const continuePayload = buildContinueTestingPayload(
    String(payload.agent_slug ?? ""),
    payload
  );
  return {
    label: `تکمیل ساخت «${name}»`,
    steps: [
      {
        type: "bridge",
        action: "wizard.create",
        payload,
        label: `پیمایش همه مراحل ویزارد تا شروع تست «${name}»`,
      },
      {
        type: "wait_for_path",
        pattern: "slug=",
        timeout_ms: 120_000,
        label: "منتظر آماده‌سازی تست…",
      },
      { type: "wait", ms: 1200 },
      {
        type: "bridge",
        action: "wizard.continue_testing",
        payload: continuePayload,
        label: "آموزش تعاملی، طراحی پنل و تأیید",
      },
    ],
  };
}

/** Continue testing only — never re-walk wizard steps 1–5. */
export function buildWizardContinueTestingScript(
  payload: Record<string, unknown>
): SupportUiScript {
  const merged = buildContinueTestingPayload(
    String(payload.agent_slug ?? ""),
    payload
  );
  const name = String(merged.name ?? "ایجنت");
  return {
    label: `ادامه تست «${name}»`,
    steps: [
      {
        type: "bridge",
        action: "wizard.continue_testing",
        payload: merged,
        label: "آموزش تعاملی، طراحی پنل و تأیید",
      },
    ],
  };
}

/** Slug from URL only — true signal that agent was persisted on this page. */
export function readWizardSlugFromUrl(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("slug")?.trim() ?? "";
}

export function readCreatedAgentSlug(): string {
  const fromUrl = readWizardSlugFromUrl();
  if (fromUrl) return fromUrl;
  try {
    return sessionStorage.getItem("ma_wizard_created_slug")?.trim() ?? "";
  } catch {
    return "";
  }
}

export function rememberCreatedAgentSlug(slug: string): void {
  const s = slug.trim();
  if (!s || typeof window === "undefined") return;
  try {
    sessionStorage.setItem("ma_wizard_created_slug", s);
  } catch {
    /* ignore */
  }
  try {
    if (!window.location.pathname.startsWith("/agents/create")) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("slug") === s) return;
    url.searchParams.set("slug", s);
    window.history.replaceState(null, "", url.toString());
  } catch {
    /* ignore */
  }
}

/**
 * Drop session slug only on a truly fresh create page (step 0, no testing UI).
 * Never call this from wizard.create — that wiped the slug and spawned a second agent.
 */
export function clearStaleWizardCreatedSlug(): void {
  if (shouldBlockWizardCreateWalk()) return;
  if (readWizardSlugFromUrl()) return;
  const stepCount = readWizardStepCount();
  // Only clear when clearly at the start of a new wizard.
  if (stepCount > 0 && readWizardStepIndex() > 0) return;
  try {
    sessionStorage.removeItem("ma_wizard_created_slug");
    sessionStorage.removeItem(WIZARD_PAYLOAD_KEY);
  } catch {
    /* ignore */
  }
}

export function isAgentCreateUserIntent(text: string): boolean {
  return /(?:ایجنت|agent).*(?:بساز|جدید|ساخت|create)|(?:بساز|ساخت|create).*(?:ایجنت|agent)|یک\s+ایجنت/i.test(
    text
  );
}

/** User wants to resume automation without re-explaining (ادامه بده، …). */
export function isWizardContinueIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return (
    /^(?:ادامه|continue|go\s*on)(?:\s|$|[!.،])/i.test(t) ||
    /ادامه\s*(?:بده|کن|ده|بدهید)/i.test(t) ||
    /(?:تست|ویزارد).{0,20}ادامه/i.test(t)
  );
}
