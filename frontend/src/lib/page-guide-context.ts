/** Page-aware hints for the platform support assistant. */

import {
  captureUiSnapshot,
  formatUiSnapshotForAgent,
  snapshotHasBlocker,
  type UiSnapshot,
} from "@/lib/ui-snapshot";
import {
  inspectWizardCreatePage,
  wizardObservationDirective,
} from "@/lib/support-page-state";
import {
  readWizardSlugFromUrl,
} from "@/lib/support-wizard-mission";
import { deriveUserCapabilities, formatCapabilitiesForAgent } from "@/lib/user-capabilities";

export type SupportUiAction = {
  type: "navigate" | "open_widget_builder";
  path?: string;
  agent_slug?: string;
  widget_type?: string;
  label?: string;
  preview?: string;
  kind?: "agent_created" | "agent_wizard" | "widget_generated" | "generic";
  highlight_widget?: string;
  wizard_step?: string;
};

export type PageGuide = {
  title: string;
  description: string;
  /** CSS selectors the assistant may highlight via {"highlight":"..."} */
  highlights: Record<string, string>;
};

const DEFAULT: PageGuide = {
  title: "پلتفرم",
  description: "داشبورد مدیریت ایجنت‌های هوش مصنوعی سازمان.",
  highlights: {
    sidebar: '[data-ma-guide="sidebar"]',
    header: '[data-ma-guide="header"]',
  },
};

const ROUTES: { test: RegExp; guide: PageGuide }[] = [
  {
    test: /^\/dashboard$/,
    guide: {
      title: "صفحه اصلی",
      description: "نمای کلی فعالیت پلتفرم، ایجنت‌های پرکاربرد و اعلان‌ها.",
      highlights: {
        stats: '[data-ma-guide="dashboard-stats"]',
        agents: '[data-ma-guide="dashboard-agents"]',
      },
    },
  },
  {
    test: /^\/agents\/create\/testing/,
    guide: {
      title: "تست و انتشار ایجنت",
      description:
        "مرحله آموزش، طراحی پنل، تست خودکار و نمایش خلاصه دانسته‌های ایجنت بعد از انتشار.",
      highlights: {
        knowledge_summary: '[data-ma-support="agent-knowledge-summary"]',
        knowledge_role: '[data-ma-support="agent-knowledge-role"]',
        knowledge_rules: '[data-ma-support="agent-knowledge-rules"]',
        knowledge_files: '[data-ma-support="agent-knowledge-files"]',
        knowledge_data: '[data-ma-support="agent-knowledge-data"]',
        knowledge_reindex: '[data-ma-support="agent-knowledge-reindex"]',
      },
    },
  },
  {
    test: /^\/agents\/create/,
    guide: {
      title: "ساخت ایجنت",
      description:
        "ویزارد ساخت ایجنت جدید — اتصالات API و اندپوینت‌ها هم در همین ویزارد مدیریت می‌شوند.",
      highlights: {
        steps: '[data-ma-guide="wizard-steps"]',
        start_test: '[data-ma-support="wizard-next"]',
        service_name: '[data-ma-support="integration-service-name"]',
        base_url: '[data-ma-support="integration-base-url"]',
        save_service: '[data-ma-support="integration-save-service"]',
        endpoint_name: '[data-ma-support="integration-endpoint-name"]',
        endpoint_path: '[data-ma-support="integration-endpoint-path"]',
        save_endpoint: '[data-ma-support="integration-save-endpoint"]',
        test_endpoint: '[data-ma-support="integration-test-endpoint"]',
        knowledge_ingest: '[data-ma-support="knowledge-ingest"]',
        knowledge_file: '[data-ma-support="knowledge-file-attach"]',
        knowledge_save: '[data-ma-support="knowledge-save"]',
        knowledge_reindex: '[data-ma-support="agent-knowledge-reindex"]',
      },
    },
  },
  {
    test: /^\/agents\/[^/]+\/edit/,
    guide: {
      title: "ویرایش ایجنت",
      description: "تغییر دستورالعمل، مدل و ابزارهای ایجنت.",
      highlights: {
        prompt: '[data-ma-guide="agent-edit-prompt"]',
      },
    },
  },
  {
    test: /^\/agents\/[^/]+$/,
    guide: {
      title: "صفحه ایجنت",
      description: "اجرای ایجنت، گفت‌وگو، پنل KPI، پایگاه دانش، تاریخچه و تنظیمات.",
      highlights: {
        tabs: '[data-ma-guide="agent-tabs"]',
        execute: '[data-ma-guide="agent-tab-execute"]',
        chat: '[data-ma-guide="agent-tab-chat"]',
        overview: '[data-ma-guide="agent-tab-overview"]',
        knowledge: '[data-ma-guide="agent-tab-knowledge"]',
      },
    },
  },
  {
    test: /^\/admin/,
    guide: {
      title: "پنل ادمین",
      description: "مدیریت ایجنت‌ها، بودجه، سلامت سیستم و تنظیمات LLM.",
      highlights: {
        agents: '[data-ma-guide="admin-agents"]',
        llm: '[data-ma-guide="admin-llm"]',
      },
    },
  },
  {
    test: /^\/agents$/,
    guide: {
      title: "فهرست ایجنت‌ها",
      description: "مرور و جستجوی ایجنت‌های سازمان.",
      highlights: {
        list: '[data-ma-guide="agents-list"]',
      },
    },
  },
  {
    test: /^\/users/,
    guide: {
      title: "کاربران و دسترسی‌ها",
      description: "مدیریت کاربران، نقش‌ها، دعوت و دسترسی per-agent.",
      highlights: {
        invite: '[data-ma-guide="users-invite"]',
        table: '[data-ma-guide="users-table"]',
      },
    },
  },
  {
    test: /^\/settings/,
    guide: {
      title: "تنظیمات",
      description: "تنظیمات حساب، اعلان‌ها و لاگ فعالیت.",
      highlights: {},
    },
  },
];

export const UI_OBSERVATION_PREFIX = "[مشاهده UI";

export function getPageGuide(pathname: string): PageGuide {
  for (const { test, guide } of ROUTES) {
    if (test.test(pathname)) return guide;
  }
  return DEFAULT;
}

function buildWizardSlugContextBlock(pathname: string): string {
  if (!pathname.startsWith("/agents/create")) return "";
  const state = inspectWizardCreatePage(pathname);
  const urlSlug = readWizardSlugFromUrl();
  const sessionSlug = (() => {
    try {
      return sessionStorage.getItem("ma_wizard_created_slug")?.trim() ?? "";
    } catch {
      return "";
    }
  })();
  const persisted = urlSlug || (state !== "wizard_steps_incomplete" ? sessionSlug : "");
  const lines = [
    `[وضعیت ویزارد — فقط برای ابزار؛ به کاربر نگو]`,
    `حالت صفحه: ${state}`,
    persisted
      ? `slug ذخیره‌شده (فقط این را برای platform_continue_agent_testing بده): ${persisted}`
      : "slug ذخیره‌شده: ندارد — ایجنت هنوز منتشر نشده؛ platform_create_agent نه continue.",
    `شناسهٔ wizard-name-slug-preview در snapshot فقط پیشنهاد نام است (هنوز در DB نیست) — هرگز حدس نزن (مثلاً …-22).`,
    wizardObservationDirective(pathname),
  ];
  return lines.join("\n");
}

function buildSupportContextBlock(
  pathname: string,
  isAdmin: boolean,
  snapshot: UiSnapshot
): string {
  const guide = getPageGuide(pathname);
  const caps = deriveUserCapabilities({ is_superuser: isAdmin });
  const capabilities = formatCapabilitiesForAgent(caps);
  const highlightKeys = Object.keys(guide.highlights).join(", ");
  const vision = formatUiSnapshotForAgent(snapshot);
  const wizardBlock = buildWizardSlugContextBlock(pathname);
  return [
    `[زمینه صفحه — فقط برای راهنمایی، به کاربر نگو]`,
    `نقش: ${isAdmin ? "ادمین" : "کاربر"}`,
    `دسترسی: ${capabilities}`,
    `صفحه: ${guide.title}`,
    `مسیر: ${pathname}`,
    `توضیح: ${guide.description}`,
    `بخش‌های قابل اشاره (کلید → selector): ${highlightKeys}`,
    ``,
    wizardBlock,
    wizardBlock ? `` : null,
    `[مشاهده UI زنده — مثل دیدن صفحه؛ از refها برای platform_execute_ui استفاده کن]`,
    vision,
    ``,
    `اگر مانع UI در snapshot دیدی — تا ۳ راه‌حل امتحان کن (بستن دیالوگ، تیک دسترسی پیش‌فرض، انتخاب کاربر). اگر نشد از کاربر بپرس؛ بعد متوقف شو.`,
    `هرگز کاری انجام نده که کاربر فعلی مجوزش را ندارد — قبل از platform_create_agent یا navigate به /agents/create /users /admin نقش را چک کن.`,
    `هرگز JSON (مثل {"highlight":...} یا ui_script) در پاسخ چت ننویس — کار UI با platform_execute_ui است.`,
    `بعد از هر اجرای UI، مشاهدهٔ جدید می‌آید — تا کار تمام شود ادامه بده.`,
    `پاسخ factual فقط از ابزار — سیستم خروجی را از نتیجهٔ ابزار می‌سازد.`,
  ]
    .filter((line): line is string => line !== null && line !== "")
    .join("\n");
}

export interface RunStateBlockInput {
  scope_type: string;
  scope_key: string;
  phase: string;
  slug: string | null;
  wizard_step_index?: number | null;
  autonomy_level?: number;
  execution_precision?: string;
  payload?: Record<string, unknown>;
}

/**
 * Machine-readable authoritative run-state block for the support agent.
 * Insert after the page-context block. The caller fetches RunState once via
 * `getRunState` (API wins over session); this function only formats it.
 */
export function formatRunStateBlock(state: RunStateBlockInput | null): string {
  if (!state) return "";
  const slug = state.slug?.trim()
    ? `slug: ${state.slug} (verified: true, source: api)`
    : "slug: (none verified)";
  const lines = [
    `[RUN STATE — AUTHORITATIVE — DO NOT GUESS]`,
    `phase: ${state.phase}`,
    slug,
    `wizard_step: ${state.wizard_step_index ?? "unknown"}`,
    `autonomy_level: ${state.autonomy_level ?? 1}`,
    `execution_precision: ${state.execution_precision ?? "guided"}`,
  ];
  if (state.phase === "training" || state.phase === "dashboard" || state.phase === "validation") {
    lines.push("FORBIDDEN: platform_create_agent");
  }
  return lines.join("\n");
}

export function buildSupportUserMessage(
  pathname: string,
  userText: string,
  isAdmin: boolean,
  snapshot?: UiSnapshot
): string {
  const snap = snapshot ?? captureUiSnapshot();
  return [buildSupportContextBlock(pathname, isAdmin, snap), `---`, userText].join("\n");
}

/** Hidden follow-up after UI steps — agent sees updated page state. */
export function buildSupportObservationMessage(
  pathname: string,
  isAdmin: boolean,
  taskHint: string,
  snapshot?: UiSnapshot
): string {
  const snap = snapshot ?? captureUiSnapshot();
  const blockerNote = snapshotHasBlocker(snap)
    ? `⚠ مانع UI: «${snap.blockerText}» — ابتدا execute_ui: بستن دیالوگ (app-dialog-confirm) و رفع مانع (مثلاً wizard-permissions-default). حداکثر ۳ تلاش؛ اگر نشد از کاربر بپرس.`
    : "اگر مانع UI در snapshot دیدی — تا ۳ راه‌حل امتحان کن؛ اگر نشد از کاربر بپرس.";
  return [
    buildSupportContextBlock(pathname, isAdmin, snap),
    `---`,
    `${UI_OBSERVATION_PREFIX} — پس از اجرای UI]`,
    taskHint,
    blockerNote,
    pathname.startsWith("/agents/create")
      ? wizardObservationDirective(pathname)
      : "نیازی به تکرار ساخت API/ایجنت نیست. فقط وضعیت فعلی را ببین و خلاصه بده یا یک execute_ui کوتاه بزن.",
  ].join("\n");
}

export function isUiObservationMessage(text: string): boolean {
  return text.trimStart().startsWith(UI_OBSERVATION_PREFIX);
}

const HIGHLIGHT_JSON_RE = /\{\s*"highlight"\s*:\s*"([^"]*)"\s*\}/g;

export function parseSupportHighlight(text: string): {
  answer: string;
  selector?: string;
  uiAction?: SupportUiAction;
} {
  const trimmed = text.trim();
  let selector: string | undefined;
  let uiAction: SupportUiAction | undefined;

  const withoutHighlights = trimmed.replace(HIGHLIGHT_JSON_RE, (_, key: string) => {
    if (!selector && key) selector = key;
    return "";
  });

  const jsonMatch = withoutHighlights.match(/\{[\s\S]*\}\s*$/);
  if (!jsonMatch) {
    return { answer: withoutHighlights.replace(/\n{3,}/g, "\n\n").trim(), selector };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
  } catch {
    return { answer: withoutHighlights.replace(/\n{3,}/g, "\n\n").trim(), selector };
  }

  const answer = withoutHighlights.slice(0, jsonMatch.index).trim();
  if (!selector && typeof parsed.highlight === "string") {
    selector = parsed.highlight;
  }

  const raw = parsed.ui_action;
  uiAction = parseSupportUiAction(raw);

  if (!selector && !uiAction) {
    return { answer: withoutHighlights.replace(/\n{3,}/g, "\n\n").trim() };
  }
  return { answer, selector, uiAction };
}

export function parseSupportUiAction(raw: unknown): SupportUiAction | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const action = raw as Record<string, unknown>;
  const label = typeof action.label === "string" ? action.label : undefined;
  const preview = typeof action.preview === "string" ? action.preview : undefined;
  const highlight_widget =
    typeof action.highlight_widget === "string" ? action.highlight_widget : undefined;
  const wizard_step = typeof action.wizard_step === "string" ? action.wizard_step : undefined;
  const kind =
    action.kind === "agent_created" ||
    action.kind === "agent_wizard" ||
    action.kind === "widget_generated" ||
    action.kind === "generic"
      ? action.kind
      : undefined;

  if (action.type === "navigate" && typeof action.path === "string") {
    return { type: "navigate", path: action.path, label, preview, kind, highlight_widget, wizard_step };
  }
  if (action.type === "open_widget_builder" && typeof action.agent_slug === "string") {
    return {
      type: "open_widget_builder",
      agent_slug: action.agent_slug,
      widget_type: typeof action.widget_type === "string" ? action.widget_type : undefined,
      label,
      preview,
      kind,
      highlight_widget,
      wizard_step,
    };
  }
  return undefined;
}

export function supportActionLabel(action: SupportUiAction): string {
  if (action.label) return action.label;
  if (action.kind === "agent_created") return "مشاهده ایجنت";
  if (action.kind === "agent_wizard") return "ادامه ساخت ایجنت";
  if (action.kind === "widget_generated") return "مشاهده پیش‌نویس ویجت";
  if (action.type === "navigate" && action.path) return "رفتن به صفحه";
  return "مشاهده نتیجه";
}

export function applySupportUiAction(
  action: SupportUiAction | undefined,
  navigate: (path: string) => void
) {
  if (!action) return;
  if (action.type === "navigate" && action.path) {
    navigate(action.path);
    return;
  }
  if (action.type === "open_widget_builder" && action.agent_slug) {
    const params = new URLSearchParams({ tab: "overview", auto_generate: "1" });
    if (action.widget_type) params.set("widget_type", action.widget_type);
    navigate(`/agents/${action.agent_slug}?${params.toString()}`);
  }
}

export function applyGuideHighlight(selector: string | undefined, durationMs = 4000) {
  document.querySelectorAll(".ma-guide-highlight").forEach((el) => {
    el.classList.remove("ma-guide-highlight");
  });
  if (!selector) return;
  const el = document.querySelector(selector);
  if (!el) return;
  el.classList.add("ma-guide-highlight");
  el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  window.setTimeout(() => el.classList.remove("ma-guide-highlight"), durationMs);
}
