import type {
  AgentAction,
  AgentCapabilities,
  AgentFilePolicy,
  AgentKind,
  AgentPromptTemplate,
} from "@/types";
import {
  DEFAULT_FILE_POLICY,
  FILE_POLICY_SPREADSHEET,
  KIND_PRESETS,
} from "@/lib/agent-presets";

/** A downloadable/attachable sample file served from /public/samples. */
export type ExampleSampleFile = {
  /** Public URL (Next serves /public at site root). */
  url: string;
  /** Filename used when staging the File for upload. */
  filename: string;
  mime: string;
};

export type AgentExample = {
  id: string;
  label: string;
  summary: string;
  kind: AgentKind;
  capabilities: AgentCapabilities;
  filePolicy?: AgentFilePolicy;
  form: {
    name: string;
    description: string;
    department: string;
    system_prompt: string;
    tool_names: string[];
    model_name: string;
    temperature: number;
  };
  actions: AgentAction[];
  templates: AgentPromptTemplate[];
  sampleFiles: ExampleSampleFile[];
};

const KARKARD_SAMPLE: ExampleSampleFile = {
  url: "/samples/karkard-raw.xlsx",
  filename: "karkard-raw.xlsx",
  mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function action(partial: Partial<AgentAction> & Pick<AgentAction, "slug" | "label" | "prompt_template">): AgentAction {
  return {
    description: "",
    icon: undefined,
    input_schema: {},
    tool_chain: [],
    confirmation_required: false,
    order_index: 0,
    ...partial,
  };
}

function template(partial: Partial<AgentPromptTemplate> & Pick<AgentPromptTemplate, "slug" | "label" | "body">): AgentPromptTemplate {
  return {
    variables: {},
    order_index: 0,
    ...partial,
  };
}

export const AGENT_EXAMPLES: AgentExample[] = [
  {
    id: "karkard",
    label: "محاسبه‌گر کارکرد (با فایل اکسل)",
    summary: "Worker + آپلود فایل · ابزار karkard_process · شامل فایل اکسل نمونه",
    kind: "worker",
    capabilities: {
      ...KIND_PRESETS.worker,
      chat_enabled: true,
      file_upload_enabled: true,
    },
    filePolicy: FILE_POLICY_SPREADSHEET,
    form: {
      name: "محاسبه‌گر کارکرد (نمونه)",
      description: "پردازش فایل اکسل کارکرد ماهانه طبق دستورالعمل HR",
      department: "hr",
      system_prompt:
        "تو دستیار محاسبه کارکرد هستی. فایل اکسل آپلودشده را با ابزار karkard_process پردازش کن و لینک خروجی نهایی را بده. هرگز از کاربر فایل نخواه؛ از آخرین فایل آپلودشده استفاده کن.",
      tool_names: ["karkard_process"],
      model_name: "claude-opus-4-8",
      temperature: 0.2,
    },
    actions: [
      action({
        slug: "process_karkard",
        label: "محاسبه کارکرد ماهانه",
        description: "فایل خام کارکرد را پردازش و فایل نهایی HR را تولید می‌کند",
        prompt_template: "فایل کارکرد آپلودشده را طبق دستورالعمل HR پردازش کن.",
        tool_chain: ["karkard_process"],
        input_schema: {
          properties: {
            jalali_year: { title: "سال شمسی", type: "integer", default: 1405 },
          },
        },
      }),
    ],
    templates: [
      template({
        slug: "karkard_help",
        label: "راهنمای کارکرد",
        body: "مراحل: آپلود اکسل خام → اجرای «محاسبه کارکرد ماهانه» → دانلود خروجی.",
      }),
    ],
    sampleFiles: [KARKARD_SAMPLE],
  },
  {
    id: "payroll",
    label: "دستیار حقوق و دستمزد (فیش PDF)",
    summary: "Worker · ابزارهای hr_lookup + report_generate · بدون نیاز به فایل",
    kind: "worker",
    capabilities: {
      ...KIND_PRESETS.worker,
      chat_enabled: true,
    },
    form: {
      name: "دستیار حقوق و دستمزد (نمونه)",
      description: "تولید فیش حقوقی و گزارش حقوق ماهانه برای پرسنل",
      department: "finance",
      system_prompt:
        "تو دستیار حقوق و دستمزد هستی. برای تولید فیش یا گزارش، ابزار report_generate را واقعاً فراخوانی کن و لینک PDF را بده. برای داده پرسنلی از hr_lookup استفاده کن.",
      tool_names: ["hr_lookup", "report_generate"],
      model_name: "claude-opus-4-8",
      temperature: 0.2,
    },
    actions: [
      action({
        slug: "generate_payslips",
        label: "صدور فیش حقوقی",
        description: "فیش حقوقی PDF برای دوره انتخابی تولید می‌کند",
        prompt_template: "فیش حقوقی دوره مشخص‌شده را بساز و لینک دانلود بده.",
        tool_chain: ["report_generate"],
        input_schema: {
          properties: {
            period: { title: "دوره", type: "string", default: "1404/12" },
          },
        },
      }),
    ],
    templates: [
      template({
        slug: "monthly_payroll",
        label: "گزارش حقوق ماهانه",
        body: "گزارش حقوق این ماه را برای همه پرسنل بساز.",
      }),
    ],
    sampleFiles: [],
  },
  {
    id: "resume",
    label: "غربال رزومه",
    summary: "Worker + گفت‌وگو · ابزار resume_screen · بدون نیاز به فایل",
    kind: "worker",
    capabilities: {
      ...KIND_PRESETS.worker,
      chat_enabled: true,
    },
    form: {
      name: "غربال رزومه (نمونه)",
      description: "غربال و رتبه‌بندی رزومه‌ها برای نقش هدف",
      department: "hr",
      system_prompt:
        "تو کارشناس استخدام هستی. برای غربال، ابزار resume_screen را فراخوانی کن و کاندیدها را با امتیاز و شورت‌لیست نهایی برگردان. راهنمای کلی نده — خروجی اجرایی بده.",
      tool_names: ["resume_screen"],
      model_name: "claude-opus-4-8",
      temperature: 0.2,
    },
    actions: [
      action({
        slug: "screen_cv",
        label: "غربال رزومه‌ها",
        description: "رزومه‌های نمونه را برای نقش هدف غربال می‌کند",
        prompt_template: "همه رزومه‌ها را برای نقش {{role}} غربال کن و خروجی نهایی بده.",
        tool_chain: ["resume_screen"],
        input_schema: {
          properties: {
            role: { title: "نقش", type: "string", default: "Backend Engineer" },
          },
        },
      }),
    ],
    templates: [
      template({
        slug: "batch_screen",
        label: "غربال دسته‌ای",
        body: "همه رزومه‌های جدید را برای نقش بک‌اند غربال کن.",
      }),
    ],
    sampleFiles: [],
  },
  {
    id: "month-end",
    label: "بازرس پایان ماه (ترکیبی)",
    summary: "Custom · کارکرد + HR + گزارش PDF · شامل فایل اکسل نمونه",
    kind: "custom",
    capabilities: {
      chat_enabled: true,
      file_upload_enabled: true,
      actions_enabled: true,
      templates_enabled: true,
      can_call_agents: false,
      supervisor_enabled: false,
      external_apis_enabled: false,
    },
    filePolicy: FILE_POLICY_SPREADSHEET,
    form: {
      name: "بازرس پایان ماه (نمونه)",
      description: "پردازش کارکرد، مقایسه با داده HR و صدور گزارش PDF برای تأیید حقوق",
      department: "hr",
      system_prompt:
        "تو «بازرس پایان ماه» هستی. ابتدا فایل کارکرد آپلودشده را با karkard_process پردازش کن، سپس با hr_lookup داده پرسنلی را بگیر، مغایرت‌ها را شماره‌دار گزارش کن و در صورت سازگاری با report_generate (نوع payroll) گزارش PDF بساز. خروجی اجرایی بده، نه راهنما.",
      tool_names: ["karkard_process", "hr_lookup", "report_generate"],
      model_name: "claude-opus-4-8",
      temperature: 0.2,
    },
    actions: [
      action({
        slug: "month_end_audit",
        label: "ممیزی پایان ماه",
        description: "کارکرد را پردازش، با HR تطبیق و گزارش نهایی تولید می‌کند",
        prompt_template:
          "فایل کارکرد آپلودشده را پردازش کن، با HR تطبیق بده، مغایرت‌ها را گزارش کن و در صورت امکان گزارش PDF حقوق بساز.",
        tool_chain: ["karkard_process", "hr_lookup", "report_generate"],
        input_schema: {
          period: { title: "دوره", type: "string", default: "1405/01" },
        },
      }),
    ],
    templates: [
      template({
        slug: "quick_audit",
        label: "بررسی سریع",
        body: "آخرین فایل کارکرد را ممیزی کن و بگو آیا برای پرداخت حقوق آماده است یا نه.",
      }),
    ],
    sampleFiles: [KARKARD_SAMPLE],
  },
];

/** Fetch the example's sample files from /public and convert to File objects. */
export async function loadExampleSampleFiles(example: AgentExample): Promise<File[]> {
  const out: File[] = [];
  for (const sample of example.sampleFiles) {
    try {
      const res = await fetch(sample.url);
      if (!res.ok) continue;
      const blob = await res.blob();
      out.push(new File([blob], sample.filename, { type: sample.mime }));
    } catch {
      // Sample file optional — ignore fetch failures so the example still loads.
    }
  }
  return out;
}

export { DEFAULT_FILE_POLICY };
