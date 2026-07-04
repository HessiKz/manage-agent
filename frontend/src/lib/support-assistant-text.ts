/** Strip platform tool JSON from support assistant chat bubbles. */

import type { SupportUiScript } from "@/lib/support-ui-script";
import {
  isWizardPlanningQuestionsVisible,
  isWizardTestingDomComplete,
} from "@/lib/support-testing-actions";

const PLATFORM_MARKERS = /"ui_script"|"ui_action"|"append_json"|"steps"|"bridge"|"wait_for_path"/;
const HIGHLIGHT_JSON = /\{\s*"highlight"\s*:\s*"[^"]*"\s*\}/g;
const UI_PROGRESS_LINE = /^الان «.+» را از طریق رابط کاربری انجام می‌دهم\.?\s*$/gm;
const UI_GENERIC_PROGRESS =
  /^در حال (?:انجام درخواست شما|انجام مراحل درخواستی|باز کردن فهرست).*$/gm;
const MISSION_LINE = /^\*\*مرحله \d+ از \d+:\*\*.*$/gm;
const OPENING_PATH_LINE = /^در حال باز کردن فهرست.*\/agents\?dept=.*$/gm;

function humanizePlatformJsonObject(data: Record<string, unknown>): string | null {
  const msg = data.message;
  if (typeof msg === "string" && msg.trim()) return msg.trim();

  const script = (data.ui_script ?? data) as { label?: string; steps?: unknown[] };
  if (Array.isArray(script.steps)) {
    const label = typeof script.label === "string" ? script.label.trim() : "";
    return label
      ? `الان «${label}» را از طریق رابط کاربری انجام می‌دهم.`
      : "در حال انجام مراحل درخواستی از طریق رابط کاربری…";
  }
  if (typeof script.label === "string" && script.label.trim()) {
    return `الان «${script.label.trim()}» را از طریق رابط کاربری انجام می‌دهم.`;
  }
  if (data.success) return "در حال انجام درخواست شما از طریق رابط کاربری…";
  return null;
}

function stripBalancedJsonBlocks(text: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < text.length) {
    const start = text.indexOf("{", i);
    if (start === -1) {
      parts.push(text.slice(i));
      break;
    }
    parts.push(text.slice(i, start));
    let depth = 0;
    let end = -1;
    for (let j = start; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) {
      parts.push(text.slice(start));
      break;
    }
    const block = text.slice(start, end + 1);
    if (PLATFORM_MARKERS.test(block)) {
      try {
        const data = JSON.parse(block) as Record<string, unknown>;
        const human = humanizePlatformJsonObject(data);
        if (human) parts.push(human);
      } catch {
        /* drop raw platform JSON */
      }
    } else {
      parts.push(block);
    }
    i = end + 1;
  }
  return parts.join("");
}

export function sanitizeSupportAssistantText(text: string): string {
  let cleaned = text.trim();
  if (!cleaned) return cleaned;

  if (cleaned.startsWith("{")) {
    try {
      const data = JSON.parse(cleaned) as Record<string, unknown>;
      const human = humanizePlatformJsonObject(data);
      if (human) return human;
    } catch {
      /* not pure JSON */
    }
  }

  if (PLATFORM_MARKERS.test(cleaned)) {
    cleaned = stripBalancedJsonBlocks(cleaned);
  }

  cleaned = cleaned.replace(HIGHLIGHT_JSON, "");
  cleaned = cleaned.replace(UI_PROGRESS_LINE, "");
  cleaned = cleaned.replace(OPENING_PATH_LINE, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

/** Lighter formatter while tokens stream — avoids stripping partial JSON mid-flight. */
export function formatStreamingSupportReply(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("{") && PLATFORM_MARKERS.test(trimmed)) {
    return "در حال آماده‌سازی پاسخ…";
  }
  return trimmed;
}

export function finalizeSupportAssistantText(
  text: string,
  opts?: { stripProgress?: boolean }
): string {
  let cleaned = sanitizeSupportAssistantText(text);
  if (opts?.stripProgress) {
    cleaned = cleaned.replace(MISSION_LINE, "");
    cleaned = cleaned.replace(UI_PROGRESS_LINE, "");
    cleaned = cleaned.replace(UI_GENERIC_PROGRESS, "");
    cleaned = cleaned.replace(OPENING_PATH_LINE, "");
  }
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

export function supportCompletionLine(script?: SupportUiScript): string {
  if (!script?.steps?.length) return "✓ تمام شد.";

  const steps = script.steps;
  const hasWizard = steps.some(
    (s) => "action" in s && String(s.action).startsWith("wizard")
  );
  const hasTraining = steps.some(
    (s) => "action" in s && String(s.action).includes("training")
  );
  const hasWidget = steps.some(
    (s) => "action" in s && s.action === "dashboard.generate_widget"
  );
  const navigateSteps = steps.filter((s) => s.type === "navigate");

  if (hasWizard || hasTraining) {
    if (isWizardTestingDomComplete()) {
      return "✓ تمام شد — ساخت، آموزش و پنل ایجنت با موفقیت انجام شد.";
    }
    if (isWizardPlanningQuestionsVisible()) {
      return "در حال تکمیل سؤالات برنامه‌ریزی تست — هنوز تمام نشده.";
    }
    return "مراحل ساخت انجام شد — تست خودکار هنوز در جریان است…";
  }
  if (hasWidget && !hasWizard) {
    return "✓ تمام شد — ویجت در پنل ایجنت ساخته شد.";
  }
  const hasUiSteps = steps.some(
    (s) => s.type === "click" || s.type === "type" || s.type === "highlight"
  );
  if (hasUiSteps && !hasWizard && !hasWidget) {
    const label = script.label || "کار UI";
    if (/ویزارد|wizard|مرحله\s*پایه/i.test(label)) {
      return "✓ مرحله UI اجرا شد — در صورت ناقص بودن ویزارد، ادامه خودکار در حال اجراست…";
    }
    return `✓ تمام شد — ${label} انجام شد.`;
  }

  if (navigateSteps.length > 0) {
    const nav = navigateSteps[navigateSteps.length - 1]!;
    const path = nav.path ?? "";
    if (path.match(/^\/agents\/[^/?]+/) && !path.includes("/agents/create")) {
      const tab = path.includes("tab=chat")
        ? " — تب گفت‌وگو باز شد"
        : path.includes("tab=overview")
          ? " — تب پنل باز شد"
          : "";
      return `✓ تمام شد — صفحه ایجنت باز شد${tab}.`;
    }
    if (nav.label?.trim()) {
      return `✓ تمام شد — ${nav.label.trim()}.`;
    }
    if (path.includes("dept=ops")) return "✓ تمام شد — فهرست ایجنت‌های عملیات باز شد.";
    if (path.includes("dept=")) return "✓ تمام شد — فهرست ایجنت‌های دپارتمان باز شد.";
    if (path.includes("/users")) return "✓ تمام شد — صفحه کاربران باز شد.";
    if (path.includes("/agents")) return "✓ تمام شد — صفحه ایجنت‌ها باز شد.";
    return "✓ تمام شد — صفحه موردنظر باز شد.";
  }
  return "✓ تمام شد.";
}

export function missionStatusLine(step: number, total: number, label: string): string {
  return `**مرحله ${step} از ${total}:** ${label}`;
}
