/** Page-aware wizard state for support automation — scan DOM before acting. */

import {
  readCreatedAgentSlug,
  readWizardSlugFromUrl,
  readWizardStepIndex,
} from "@/lib/support-wizard-mission";

export type WizardCreatePageState =
  | "off_page"
  | "wizard_steps_incomplete"
  | "testing_training"
  | "testing_planning"
  | "testing_running"
  | "testing_complete"
  | "testing_error";

function hasMarker(marker: string): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(document.querySelector(`[data-ma-support="${marker}"]`));
}

/** Inspect live page before choosing create vs continue-testing vs planning resolve. */
export function inspectWizardCreatePage(pathname: string): WizardCreatePageState {
  if (!pathname.startsWith("/agents/create")) return "off_page";
  if (hasMarker("wizard-testing-complete")) return "testing_complete";
  if (hasMarker("wizard-testing-error")) return "testing_error";
  if (hasMarker("wizard-planning-questions")) return "testing_planning";
  if (hasMarker("training-panel")) return "testing_training";

  const tabs = document.querySelectorAll('[data-ma-support^="wizard-step-tab-"]');
  if (tabs.length > 0) {
    const active = readWizardStepIndex();
    if (active < tabs.length - 1) return "wizard_steps_incomplete";
  }

  const urlSlug = readWizardSlugFromUrl();
  if (urlSlug || hasMarker("wizard-bootstrap-loading") || hasMarker("dashboard-panel")) {
    return "testing_running";
  }

  return "wizard_steps_incomplete";
}

export function wizardObservationDirective(pathname: string): string {
  const state = inspectWizardCreatePage(pathname);
  switch (state) {
    case "wizard_steps_incomplete":
      return (
        "ویزارد مراحل ۱–۵ ناقص است — فقط platform_create_agent (یک‌بار). " +
        "اگر نام در snapshot هست همان را بده."
      );
    case "testing_planning":
      return (
        "سؤالات برنامه‌ریزی تست روی صفحه است — platform_continue_agent_testing " +
        "یا پاسخ خودکار؛ **هرگز** platform_create_agent را دوباره نزن (مرحله ۱–۵ تکرار می‌شود)."
      );
    case "testing_training":
    case "testing_running":
      return (
        "ایجنت ذخیره شده — فقط platform_continue_agent_testing برای آموزش/پنل/تست. " +
        "platform_create_agent ممنوع است."
      );
    case "testing_complete":
      return "ساخت و تست تمام شد — خلاصه بده؛ ابزار ویزارد دوباره نزن.";
    case "testing_error":
      return "تست ناموفق — وضعیت را توضیح بده و از کاربر بپرس چطور ادامه دهد.";
    default:
      return "نیازی به تکرار ساخت نیست — وضعیت snapshot را ببین و خلاصه بده.";
  }
}
