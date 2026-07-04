import {
  buildSampleFile,
  exampleChatPrompt,
  policyPrefersXlsx,
  resolveKarkardSampleFile,
  sampleVariablesForAction,
} from "@/lib/agent-test-fixtures";
import type {
  Agent,
  AgentAction,
  AgentApiBindings,
  AgentLink,
  AgentPromptTemplate,
} from "@/types";

export type TrainingScenarioContext = {
  links?: AgentLink[];
  actions?: AgentAction[];
  templates?: AgentPromptTemplate[];
};

export type TrainingChecklistItem = {
  id: string;
  label: string;
  hint: string;
};

export type TrainingProgressStep = {
  id: string;
  label: string;
  status: "pending" | "current" | "done";
};

export type TrainingProgressInput = {
  hasUserTurn: boolean;
  hasAssistantReply: boolean;
  canFinish: boolean;
};

export function buildTrainingProgressSteps(
  input: TrainingProgressInput
): TrainingProgressStep[] {
  const { hasUserTurn, hasAssistantReply, canFinish } = input;

  const askStatus: TrainingProgressStep["status"] = hasUserTurn
    ? "done"
    : "current";
  const reviewStatus: TrainingProgressStep["status"] = hasAssistantReply
    ? "done"
    : hasUserTurn
      ? "current"
      : "pending";
  const confirmStatus: TrainingProgressStep["status"] = canFinish ? "current" : "pending";

  return [
    { id: "ask", label: "سؤال بپرسید", status: askStatus },
    { id: "review", label: "پاسخ را ببینید", status: reviewStatus },
    { id: "confirm", label: "تأیید کنید", status: confirmStatus },
  ];
}

export type TrainingAutoFinishPlan = {
  prompt: string;
  formatNotes: string;
  resolveUpload?: () => Promise<File>;
  uploadLabel?: string;
};

export function parseApiBindings(config?: Record<string, unknown> | null): AgentApiBindings {
  const raw = config?.api_bindings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { service_ids: [], endpoint_ids: [] };
  }
  const o = raw as Record<string, unknown>;
  return {
    service_ids: Array.isArray(o.service_ids) ? (o.service_ids as string[]) : [],
    endpoint_ids: Array.isArray(o.endpoint_ids) ? (o.endpoint_ids as string[]) : [],
  };
}

function linkedCalleeNames(links: AgentLink[] | undefined): string[] {
  return (links ?? [])
    .map((l) => l.callee_name?.trim() || l.callee_slug?.trim())
    .filter(Boolean) as string[];
}

export function capabilitySummaryLines(agent: Agent): string[] {
  const caps = agent.capabilities;
  const lines: string[] = [];
  if (caps.supervisor_enabled) lines.push("سرپرست — مسیریابی به زیرایجنت");
  if (caps.can_call_agents) lines.push("فراخوانی ایجنت‌های دیگر");
  if (caps.file_upload_enabled) lines.push("دریافت و پردازش فایل");
  if (caps.actions_enabled) lines.push("اجرای اقدامات از پیش تعریف‌شده");
  if (caps.external_apis_enabled) lines.push("درخواست به API خارجی");
  if (caps.templates_enabled) lines.push("قالب‌های آماده گفت‌وگو");
  if (caps.chat_enabled && lines.length === 0) lines.push("گفت‌وگوی متنی");
  if (caps.chat_enabled && !caps.supervisor_enabled && lines.length > 0) {
    lines.unshift("گفت‌وگوی متنی");
  }
  return lines;
}

export function buildTrainingChecklist(
  agent: Agent,
  ctx: TrainingScenarioContext = {}
): TrainingChecklistItem[] {
  const caps = agent.capabilities;
  const items: TrainingChecklistItem[] = [];
  const calHint =
    "پاسخ را با فرمت، لحن و ساختار مورد انتظار تست کنید (عنوان، bullet، رسمی/صمیمی و …).";

  if (caps.supervisor_enabled) {
    const names = linkedCalleeNames(ctx.links);
    items.push({
      id: "supervisor",
      label: "مسیریابی سرپرست",
      hint: names.length
        ? `درخواست نمونه بدهید تا به یکی از زیرایجنت‌ها (${names.slice(0, 3).join("، ")}) هدایت کند. ${calHint}`
        : `درخواست نمونه بدهید و ببینید به زیرایجنت مناسب مسیریابی می‌کند. ${calHint}`,
    });
  } else if (caps.can_call_agents) {
    items.push({
      id: "call_agents",
      label: "فراخوانی ایجنت دیگر",
      hint: `از ایجنت بخواهید یک ایجنت متصل را برای تکمیل کار فراخوانی کند. ${calHint}`,
    });
  }

  if (caps.external_apis_enabled) {
    const bindings = parseApiBindings(agent.config_json);
    const n = bindings.endpoint_ids.length + bindings.service_ids.length;
    items.push({
      id: "api",
      label: "تست API خارجی",
      hint:
        n > 0
          ? `درخواستی بدهید که از API متصل (${n} سرویس/endpoint) داده بگیرد و خلاصه کند. ${calHint}`
          : `درخواستی بدهید که از API متصل داده نمونه بگیرد. ${calHint}`,
    });
  }

  if (caps.file_upload_enabled) {
    items.push({
      id: "file",
      label: "آپلود و استفاده از فایل",
      hint: `یک فایل نمونه پیوست کنید و بپرسید ایجنت آن را می‌بیند و آماده پردازش است. ${calHint}`,
    });
  }

  if (caps.actions_enabled && ctx.actions?.length) {
    const act = ctx.actions[0];
    items.push({
      id: "action",
      label: `اجرای اقدام: ${act.label}`,
      hint: caps.chat_enabled
        ? `می‌توانید از چت بخواهید اقدام «${act.label}» را اجرا کند، یا پایین «اجرای اقدام تست» را بزنید. ${calHint}`
        : `این ایجنت گفت‌وگوی آزاد ندارد — دکمه «اجرای اقدام تست» را بزنید. ${calHint}`,
    });
  } else if (caps.chat_enabled && !caps.supervisor_enabled) {
    items.push({
      id: "chat",
      label: "تست گفت‌وگو",
      hint: `سؤال نمونه بپرسید و خروجی را با انتظار خود مقایسه کنید. ${calHint}`,
    });
  }

  if (!items.length) {
    items.push({
      id: "format",
      label: "کالیبراسیون فرمت",
      hint: calHint,
    });
  }

  return items;
}

const DEFAULT_FORMAT_NOTES =
  "پاسخ کوتاه، ساختارمند و رسمی — با bullet در صورت نیاز.";

export function buildTrainingTaskPrompt(
  agent: Agent,
  ctx: TrainingScenarioContext = {}
): string {
  const caps = agent.capabilities;
  const task = exampleChatPrompt(agent, ctx.templates ?? []);

  if (caps.actions_enabled && !caps.chat_enabled && ctx.actions?.length) {
    const act = ctx.actions[0];
    const vars = sampleVariablesForAction(act);
    const varLine = Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("، ");
    return (
      `تست کالیبراسیون اقدام «${act.label}»:\n` +
      (varLine ? `ورودی نمونه: ${varLine}\n` : "") +
      "خروجی را مطابق انتظار ادمین (ساختار و لحن) برگردان."
    );
  }

  if (caps.file_upload_enabled && caps.chat_enabled) {
    return (
      `تست کالیبراسیون با فایل:\n` +
      `${task}\n\n` +
      "(اگر فایل پیوست کرده‌ام، به آن اشاره کن و بگو آماده پردازش هست یا نه.)"
    );
  }

  return `تست کالیبراسیون:\n${task}`;
}

export function buildTrainingSuggestedPrompts(
  agent: Agent,
  ctx: TrainingScenarioContext = {}
): { label: string; prompt: string }[] {
  const caps = agent.capabilities;
  const out: { label: string; prompt: string }[] = [];
  const formatSuffix = "\n\nفرمت: عنوان کوتاه + ۲–۳ bullet؛ لحن رسمی.";

  if (caps.supervisor_enabled) {
    const names = linkedCalleeNames(ctx.links);
    const target = names[0] ? ` (مثلاً ${names[0]})` : "";
    out.push({
      label: "مسیریابی سرپرست",
      prompt:
        `درخواست: «وضعیت حقوق این ماه را بررسی کن» — به زیرایجنت مناسب${target} مسیریابی کن و نتیجه را خلاصه کن.` +
        formatSuffix,
    });
  }

  if (caps.can_call_agents) {
    out.push({
      label: "فراخوانی ایجنت",
      prompt:
        "از دستیار گفت‌وگو بپرس: «یک جمله درباره وظایف این پلتفرم بگو» و پاسخ را برگردان." +
        formatSuffix,
    });
  }

  if (caps.external_apis_enabled) {
    out.push({
      label: "درخواست API",
      prompt:
        "از API متصل یک درخواست نمونه بزن (مثلاً health یا لیست) و نتیجه را در ۳ bullet خلاصه کن." +
        formatSuffix,
    });
  }

  if (caps.file_upload_enabled) {
    out.push({
      label: "بررسی فایل",
      prompt:
        "فایل‌های آپلودشده را فهرست کن و بگو آماده پردازش هستند یا چه کمکی نیاز است." +
        formatSuffix,
    });
  }

  if (caps.actions_enabled && ctx.actions?.length) {
    const act = ctx.actions[0];
    out.push({
      label: `اقدام: ${act.label}`,
      prompt: `اقدام «${act.label}» را با ورودی نمونه اجرا کن و خروجی را ساختارمند بده.` + formatSuffix,
    });
  }

  if (caps.chat_enabled && out.length < 3) {
    out.push({
      label: "گفت‌وگوی نمونه",
      prompt: exampleChatPrompt(agent, ctx.templates ?? []) + formatSuffix,
    });
  }

  return out.slice(0, 3);
}

export function buildTrainingAutoFinishPlan(
  agent: Agent,
  ctx: TrainingScenarioContext = {},
  formatNotes = DEFAULT_FORMAT_NOTES
): TrainingAutoFinishPlan {
  const plan: TrainingAutoFinishPlan = {
    prompt: `${buildTrainingTaskPrompt(agent, ctx)}\n\nفرمت خروجی مورد نظر:\n${formatNotes}`,
    formatNotes,
  };

  if (agent.capabilities.file_upload_enabled && agent.file_policy) {
    const policy = agent.file_policy;
    if (policyPrefersXlsx(policy)) {
      plan.resolveUpload = resolveKarkardSampleFile;
      plan.uploadLabel = "sample-karkard-raw.xlsx";
    } else {
      const file = buildSampleFile(policy);
      plan.resolveUpload = async () => file;
      plan.uploadLabel = file.name;
    }
  }

  return plan;
}

export function trainingUsesChat(agent: Agent): boolean {
  return Boolean(agent.capabilities?.chat_enabled);
}

export function trainingUsesActionProbe(agent: Agent, actions: AgentAction[] = []): boolean {
  return Boolean(
    agent.capabilities?.actions_enabled && !agent.capabilities?.chat_enabled && actions.length > 0
  );
}
