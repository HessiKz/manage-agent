import type { ToolInfo } from "@/types";

export type ToolCategory = "hr" | "finance" | "crm" | "files" | "other";

export type FriendlyTool = {
  slug: string;
  title: string;
  summary: string;
  category: ToolCategory;
  whenToUse: string;
};

const FRIENDLY: Record<string, Omit<FriendlyTool, "slug">> = {
  hr_lookup: {
    title: "اطلاعات پرسنل و حقوق",
    summary: "نام، دپارتمان، حقوق پایه و اضافه‌کار کارمند را می‌خواند.",
    category: "hr",
    whenToUse: "وقتی ایجنت باید داده پرسنل یا حقوق را برای پاسخ یا گزارش بخواند.",
  },
  karkard_process: {
    title: "محاسبه کارکرد (اکسل)",
    summary: "فایل خام کارکرد ماهانه را طبق قوانین HR پردازش و فایل نهایی می‌سازد.",
    category: "files",
    whenToUse: "بعد از آپلود فایل اکسل کارکرد توسط کاربر.",
  },
  report_generate: {
    title: "ساخت گزارش PDF",
    summary: "گزارش مالی یا عملیاتی آماده دانلود تولید می‌کند.",
    category: "finance",
    whenToUse: "برای فاکتور، حقوق، یا گزارش‌های دوره‌ای.",
  },
  budget_lookup: {
    title: "بررسی بودجه ایجنت",
    summary: "سقف هزینه ماهانه و مقدار مصرف‌شده را نشان می‌دهد.",
    category: "finance",
    whenToUse: "وقتی ایجنت باید بداند چقدر از بودجه باقی مانده.",
  },
  resume_screen: {
    title: "غربال رزومه",
    summary: "رزومه‌ها را برای یک نقش مشخص بررسی و امتیازدهی می‌کند.",
    category: "hr",
    whenToUse: "وقتی ایجنت باید کاندیداها را برای استخدام اولیه غربال کند.",
  },
  crm_lookup: {
    title: "اطلاعات مشتری",
    summary: "پروفایل مشتری و تیکت‌های باز را از CRM می‌گیرد.",
    category: "crm",
    whenToUse: "پشتیبانی، فروش، یا پیگیری مشتری.",
  },
};

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  hr: "منابع انسانی",
  finance: "مالی و گزارش",
  crm: "مشتری و پشتیبانی",
  files: "فایل و پردازش",
  other: "سایر",
};

export function friendlyTool(tool: ToolInfo): FriendlyTool {
  const mapped = FRIENDLY[tool.slug];
  if (mapped) return { slug: tool.slug, ...mapped };
  const name = tool.name?.replace(/_/g, " ") ?? tool.slug;
  return {
    slug: tool.slug,
    title: name,
    summary: tool.description || "قابلیت کمکی برای این ایجنت.",
    category: "other",
    whenToUse: "در صورت نیاز تیم فنی آن را فعال کنید.",
  };
}

export function groupToolsByCategory(tools: ToolInfo[]): Map<ToolCategory, FriendlyTool[]> {
  const map = new Map<ToolCategory, FriendlyTool[]>();
  for (const t of tools) {
    const f = friendlyTool(t);
    const list = map.get(f.category) ?? [];
    list.push(f);
    map.set(f.category, list);
  }
  const order: ToolCategory[] = ["hr", "finance", "crm", "files", "other"];
  return new Map(order.filter((c) => map.has(c)).map((c) => [c, map.get(c)!]));
}

export function categoryLabel(cat: ToolCategory): string {
  return CATEGORY_LABELS[cat];
}
