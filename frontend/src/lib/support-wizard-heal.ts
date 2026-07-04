/** Local wizard heal — scan page first, never re-walk steps 1–5 when slug exists. */

import type { SupportUiScript } from "@/lib/support-ui-script";
import { resolveExistingTestingSlug } from "@/hooks/use-testing-support-bridge";
import { resolveVisiblePlanningOnPage } from "@/lib/support-testing-actions";
import {
  buildContinueTestingPayload,
  buildWizardContinueTestingScript,
  buildWizardCreateBridgeScript,
  readCreatedAgentSlug,
  readStoredWizardCreatePayload,
  readWizardFormSnapshot,
} from "@/lib/support-wizard-mission";
import { inspectWizardCreatePage } from "@/lib/support-page-state";

export type WizardHealResult =
  | "planning_resolved"
  | "create"
  | "continue_testing"
  | "none";

function planWizardCreateScript(): SupportUiScript | null {
  const snapshot = readWizardFormSnapshot() ?? readStoredWizardCreatePayload();
  if (!snapshot?.name) return null;
  return buildWizardCreateBridgeScript(snapshot);
}

/** Plan a local script for «ادامه بده» — bypasses LLM slug guessing. */
export async function resolveLocalWizardContinueScript(
  pathname: string
): Promise<SupportUiScript | null> {
  if (!pathname.startsWith("/agents/create")) return null;

  const state = inspectWizardCreatePage(pathname);

  // Steps 1–5: walk the wizard — never jump to step-6 testing.
  if (state === "wizard_steps_incomplete") {
    return planWizardCreateScript();
  }

  if (state === "testing_planning") {
    return null;
  }

  if (
    state === "testing_training" ||
    state === "testing_running" ||
    state === "testing_error"
  ) {
    const slug = readCreatedAgentSlug();
    if (slug) {
      return buildWizardContinueTestingScript(buildContinueTestingPayload(slug));
    }
    try {
      const { slug: resolved } = await resolveExistingTestingSlug({});
      return buildWizardContinueTestingScript(buildContinueTestingPayload(resolved));
    } catch {
      return null;
    }
  }

  return null;
}

export async function healIncompleteWizardMission(
  playScript: (script: SupportUiScript) => Promise<void>
): Promise<WizardHealResult> {
  const pathname = window.location.pathname;
  if (!pathname.startsWith("/agents/create")) return "none";

  const state = inspectWizardCreatePage(pathname);
  if (state === "testing_planning") {
    if (await resolveVisiblePlanningOnPage()) return "planning_resolved";
  }

  if (state === "wizard_steps_incomplete") {
    const script = planWizardCreateScript();
    if (!script) return "none";
    await playScript(script);
    return "create";
  }

  if (
    state === "testing_training" ||
    state === "testing_running" ||
    state === "testing_error"
  ) {
    const slug = readCreatedAgentSlug();
    if (!slug) return "none";
    await playScript(
      buildWizardContinueTestingScript(buildContinueTestingPayload(slug))
    );
    return "continue_testing";
  }

  return "none";
}
