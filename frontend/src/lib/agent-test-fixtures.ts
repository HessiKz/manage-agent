import type {
  Agent,
  AgentAction,
  AgentFile,
  AgentFilePolicy,
  AgentPromptTemplate,
} from "@/types";
import { displayAgentFileName, isRuntimeSampleFileName } from "@/lib/agent-file-roles";
import { filePolicyForRole } from "@/lib/agent-presets";

export type AgentTestStepKind =
  | "upload"
  | "action"
  | "invoke"
  | "graph"
  | "info";

type InputSchemaField = {
  title?: string;
  type?: string;
  default?: string | number | boolean;
};

export type AgentTestStepPlan = {
  kind: AgentTestStepKind;
  label: string;
  description: string;
  actionSlug?: string;
  variables?: Record<string, string | number | boolean>;
  prompt?: string;
  file?: File;
  resolveFile?: () => Promise<File>;
};

const SAMPLE_VARS: Record<string, string | number> = {
  period: "1404/02",
  month: "بهمن",
  role: "مهندس نرم‌افزار",
  report_type: "خلاصه مالی",
  batch: "دسته-A",
  task: "وضعیت را خلاصه کن",
  question: "خلاصه وضعیت را بده",
  jalali_year: 1405,
  company_name: "شرکت توسعه کارآفرینی سوره",
};

export function sampleVariablesForAction(
  action: AgentAction
): Record<string, string | number | boolean> {
  const schema = (action.input_schema ?? {}) as Record<string, InputSchemaField>;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, field] of Object.entries(schema)) {
    if (key in SAMPLE_VARS) {
      out[key] = SAMPLE_VARS[key];
      continue;
    }
    if (field.default !== undefined) {
      out[key] = field.default;
      continue;
    }
    if (field.type === "integer") {
      out[key] = 1405;
      continue;
    }
    if (field.type === "number") {
      out[key] = 0;
      continue;
    }
    out[key] = `نمونه-${key}`;
  }
  return out;
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function policyPrefersXlsx(policy: AgentFilePolicy): boolean {
  const mimes = policy.allowed_mime_types ?? [];
  const exts = policy.allowed_extensions ?? [];
  return (
    mimes.includes(XLSX_MIME) ||
    mimes.includes("application/vnd.ms-excel") ||
    exts.some((e) => {
      const lower = e.toLowerCase();
      return lower === ".xlsx" || lower === ".xls";
    })
  );
}

export async function resolveKarkardSampleFile(): Promise<File> {
  const res = await fetch("/samples/karkard-raw.xlsx");
  if (!res.ok) {
    throw new Error("فایل نمونه کارکرد در دسترس نیست");
  }
  const blob = await res.blob();
  return new File([blob], "sample-karkard-raw.xlsx", { type: XLSX_MIME });
}

export function buildSampleFile(policy: AgentFilePolicy): File {
  const mimes = policy.allowed_mime_types ?? [];
  const exts = policy.allowed_extensions ?? [];

  const preferCsv =
    mimes.includes("text/csv") || exts.some((e) => e.toLowerCase().includes("csv"));
  const preferPdf =
    !preferCsv &&
    (mimes.includes("application/pdf") || exts.some((e) => e.toLowerCase().includes("pdf")));

  if (preferCsv) {
    const body = "date,amount,description\n1404/01/15,1250000,تراکنش نمونه بانکی\n";
    return new File([body], "sample-bank.csv", { type: "text/csv" });
  }
  if (preferPdf) {
    const body = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF";
    return new File([body], "sample-doc.pdf", { type: "application/pdf" });
  }
  const body =
    "این یک فایل نمونه برای تست ایجنت است.\nشماره پرسنلی: 1001\nوضعیت: تأیید شده\n";
  return new File([body], "sample.txt", { type: "text/plain" });
}

export function exampleChatPrompt(
  agent: Agent,
  templates: AgentPromptTemplate[] = []
): string {
  if (templates.length > 0) {
    return templates[0].body;
  }
  const caps = agent.capabilities;
  if (caps.supervisor_enabled) {
    return "درخواست: «وضعیت حقوق این ماه را بررسی کن». به زیرایجنت مناسب مسیریابی کن و نتیجه را خلاصه کن.";
  }
  if (caps.can_call_agents) {
    return "از دستیار گفت‌وگو بپرس: «یک جمله درباره وظایف این پلتفرم بگو» و پاسخ را برگردان.";
  }
  if (agent.slug === "invoice") {
    return "فاکتورهای دسته A را از داده نمونه workspace صادر کن و لینک دانلود گزارش را بده.";
  }
  if (
    agent.slug === "example-karkard" ||
    agent.tool_names?.includes("run_agent_script")
  ) {
    return (
      "فایل کارکرد از قبل در workspace است. اگر خروجی پردازش‌شده وجود دارد فقط لینک دانلود را بده؛ " +
      "وگرنه `run_agent_script` را با storage_path کامل از بخش فایل‌های آپلودشده (نه فقط نام فایل) فراخوانی کن."
    );
  }
  if (caps.file_upload_enabled && !caps.chat_enabled && !caps.actions_enabled) {
    return "فایل‌های آپلودشده را فهرست کن و بگو آماده پردازش هستند یا نه.";
  }
  if (agent.kind === "worker" && caps.actions_enabled) {
    return "خلاصه‌ای از آخرین اقدام انجام‌شده روی حقوق و دستمزد بده.";
  }
  if (agent.kind === "custom") {
    return "یک تست کوتاه ادمین: قابلیت‌های فعال این ایجنت را در دو جمله توضیح بده.";
  }
  return `سلام — این یک تست خودکار ادمین برای ایجنت «${agent.name}» است. یک پاسخ کوتاه بده.`;
}

type WidgetDashboardContext = {
  profile?: string;
  domain_label?: string;
  panel_title?: string;
  stat_cards?: { length: number } | unknown[];
  line_chart?: unknown | null;
  pie_chart?: unknown | null;
  review_table?: unknown | null;
  hide_hr_savings?: boolean;
};

function hasStatCards(dashboard?: WidgetDashboardContext | null): boolean {
  return Array.isArray(dashboard?.stat_cards) && dashboard.stat_cards.length > 0;
}

/** Admin test prompt for AI widget generation — tailored to agent domain and missing widgets. */
export function buildWidgetAdminTestPrompt(
  agent: Agent,
  dashboard?: WidgetDashboardContext | null
): string {
  const profile = dashboard?.profile ?? "";
  const slug = agent.slug ?? "";
  const desc = agent.description?.trim() ?? "";
  const domain = dashboard?.domain_label ?? agent.department ?? "عملیات";

  const missing: string[] = [];
  if (!hasStatCards(dashboard)) missing.push("۴ کارت KPI");
  if (!dashboard?.line_chart) missing.push("نمودار خطی روند ماهانه");
  if (!dashboard?.pie_chart) missing.push("نمودار دایره‌ای توزیع");
  if (!dashboard?.review_table) missing.push("جدول بررسی موارد");
  if (!dashboard?.hide_hr_savings) missing.push("پنل صرفه‌جویی HR");

  const focus = missing[0] ?? "یک ویجت KPI جدید";

  if (/resume|hr|recruit|غربال|رزومه/i.test(`${profile} ${slug} ${desc}`)) {
    return (
      `برای ایجنت «${agent.name}» (${domain}) ${focus} بساز: ` +
      "رزومه‌های در صف، تأیید اولیه، رد شده و در انتظار — با اعداد واقع‌گرایانه فارسی. " +
      (missing.includes("نمودار دایره‌ای توزیع")
        ? "نمودار دایره‌ای نتیجه غربال‌گری (shortlist / rejected / waiting) هم اضافه کن."
        : "اگر نمودار وجود ندارد، روند غربال‌گری هفتگی را با نمودار خطی نشان بده.")
    );
  }

  if (/payroll|salary|حقوق|دستمزد|karkard|کارکرد/i.test(`${profile} ${slug} ${desc}`)) {
    return (
      `برای ایجنت «${agent.name}» (${domain}) ${focus} بساز: ` +
      "شاخص‌های حقوق و دستمزد — پرداخت ماهانه، اضافه‌کار، تعداد پرسنل — با برچسب‌های fa-IR. " +
      (missing.includes("نمودار خطی روند ماهانه")
        ? "نمودار خطی ۶ ماهه پرداخت واقعی در برابر پیش‌بینی اضافه کن."
        : "جدول بررسی موارد اضافه‌کار مشکوک را در صورت نبود اضافه کن.")
    );
  }

  if (/invoice|فاکتور|billing/i.test(`${profile} ${slug} ${desc}`)) {
    return (
      `برای ایجنت «${agent.name}» (${domain}) ${focus} بساز: ` +
      "وضعیت فاکتورها (پرداخت‌شده، معوق، در انتظار) — KPI و نمودار دایره‌ای با اعداد نمونه."
    );
  }

  if (/ticket|support|پشتیبانی/i.test(`${profile} ${slug} ${desc}`)) {
    return (
      `برای ایجنت «${agent.name}» (${domain}) ${focus} بساز: ` +
      "تیکت‌های باز، حل‌شده، میانگین زمان پاسخ — کارت KPI + نمودار خطی روند ۴ هفته."
    );
  }

  if (desc) {
    return (
      `برای ایجنت «${agent.name}» با کاربرد «${desc.slice(0, 120)}» ${focus} طراحی کن. ` +
      "برچسب‌ها فارسی، اعداد واقع‌گرایانه، متناسب با دامنه کاری ایجنت."
    );
  }

  return (
    `تست ادمین — برای ایجنت «${agent.name}» (${domain}) ${focus} بساز ` +
    "که عملکرد و خروجی‌های اصلی این ایجنت را در پنل نشان دهد."
  );
}

export function buildAgentTestPlan(
  agent: Agent,
  actions: AgentAction[] = [],
  templates: AgentPromptTemplate[] = [],
  existingFiles: AgentFile[] = []
): AgentTestStepPlan[] {
  const caps = agent.capabilities ?? {
    chat_enabled: true,
    file_upload_enabled: false,
    actions_enabled: false,
    templates_enabled: false,
    can_call_agents: false,
    supervisor_enabled: false,
  };
  const policy = filePolicyForRole(agent.file_policy, "input");
  const steps: AgentTestStepPlan[] = [];
  const runtimeFiles = existingFiles.filter((f) => isRuntimeSampleFileName(f.filename));

  steps.push({
    kind: "info",
    label: "آماده‌سازی",
    description: `نوع: ${agent.kind} · گفت‌وگو: ${caps.chat_enabled ? "بله" : "خیر"} · فایل: ${caps.file_upload_enabled ? "بله" : "خیر"}`,
  });

  if (caps.file_upload_enabled && policy) {
    const alreadyHasMatchingFile =
      runtimeFiles.length > 0 &&
      (!policyPrefersXlsx(policy) ||
        runtimeFiles.some((f) => /\.xlsx?$/i.test(f.filename)));

    if (alreadyHasMatchingFile) {
      steps.push({
        kind: "info",
        label: "فایل نمونه از قبل موجود",
        description: `${displayAgentFileName(runtimeFiles[0].filename)} — آپلود مجدد لازم نیست؛ ایجنت مستقیماً پردازش می‌کند.`,
      });
    } else if (policyPrefersXlsx(policy)) {
      steps.push({
        kind: "upload",
        label: "آپلود فایل نمونه",
        description: "sample-karkard-raw.xlsx (اکسل کارکرد)",
        resolveFile: resolveKarkardSampleFile,
      });
    } else {
      const file = buildSampleFile(policy);
      steps.push({
        kind: "upload",
        label: "آپلود فایل نمونه",
        description: `${file.name} (${file.type})`,
        file,
      });
    }
  }

  if (caps.actions_enabled && actions.length > 0) {
    const act = actions[0];
    const variables = sampleVariablesForAction(act);
    steps.push({
      kind: "action",
      label: `اجرای اقدام: ${act.label}`,
      description: Object.keys(variables).length
        ? `ورودی‌ها: ${Object.entries(variables).map(([k, v]) => `${k}=${v}`).join("، ")}`
        : "بدون ورودی",
      actionSlug: act.slug,
      variables,
    });
  }

  if (caps.supervisor_enabled) {
    steps.push({
      kind: "graph",
      label: "بررسی گراف سرپرست",
      description: "نمایش زیرایجنت‌های متصل",
    });
  }

  if (caps.external_apis_enabled) {
    steps.push({
      kind: "invoke",
      label: "تست API خارجی",
      description: "فراخوانی endpoint متصل و خلاصه نتیجه",
      prompt:
        `تست ادمین برای «${agent.name}»: از API خارجی متصل یک درخواست نمونه بزن ` +
        "و پاسخ را در ۳ bullet خلاصه کن.",
    });
  }

  if (caps.can_call_agents) {
    steps.push({
      kind: "invoke",
      label: "تست فراخوانی ایجنت",
      description: "فراخوانی ایجنت متصل به‌عنوان ابزار",
      prompt:
        `تست ادمین برای «${agent.name}»: یک ایجنت متصل را برای تکمیل ` +
        "درخواست نمونه فراخوانی کن و نتیجه را برگردان.",
    });
  }

  if (caps.chat_enabled) {
    const prompt = exampleChatPrompt(agent, templates);
    steps.push({
      kind: "invoke",
      label: caps.supervisor_enabled ? "تست مسیریابی" : "تست گفت‌وگو",
      description: prompt.slice(0, 120) + (prompt.length > 120 ? "…" : ""),
      prompt,
    });
  } else if (caps.file_upload_enabled && policy?.require_files_to_invoke) {
    steps.push({
      kind: "info",
      label: "اجرای گفت‌وگو",
      description: "این ایجنت فقط با فایل کار می‌کند — پس از آپلود، از پنل فایل استفاده کنید.",
    });
  }

  if (steps.length === 1) {
    steps.push({
      kind: "info",
      label: "تست محدود",
      description: "این ایجنت قابلیت قابل اجرای خودکار ندارد (تنها پیش‌نمایش).",
    });
  }

  return steps;
}