/**
 * Plain-text previews for lists and notifications — no markdown, HTML comments, or scaffolding.
 */

import { sanitizeChatMessage } from "@/lib/sanitize-chat-message";

const PROMPT_MARKER = "<!--ma-inputs-->";
const INPUT_MARKERS = [
  "\n\nContext for tools",
  "\n\nComplete this action by calling",
  "[زمینه صفحه",
];

const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const MD_HEADER = /^#{1,6}\s+/gm;
const MD_BOLD = /\*\*([^*]+)\*\*/g;
const MD_ITALIC = /(?<!\*)\*([^*]+)\*(?!\*)/g;
const MD_CODE = /`([^`]+)`/g;
const MD_LINK = /\[([^\]]+)\]\([^)]*\)/g;
const TEMPLATE_VAR = /\{\{[^}]+\}\}/g;
const JSON_LINE = /^\s*[\{\[]/;
const TECH_LINE = /(agent_id|storage_path|tool_chain|function calling|\{\{[^}]+\}\})/i;
const SYSTEM_JUNK =
  /automatic validation run|return a one-line successful response|complete this action by calling|context for tools/i;

function stripMarkdown(text: string): string {
  return text
    .replace(HTML_COMMENT, "")
    .replace(MD_HEADER, "")
    .replace(MD_BOLD, "$1")
    .replace(MD_ITALIC, "$1")
    .replace(MD_CODE, "$1")
    .replace(MD_LINK, "$1")
    .replace(TEMPLATE_VAR, "");
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isSystemOnlyJunk(text: string): boolean {
  if (!text) return true;
  if (SYSTEM_JUNK.test(text) && !/[\u0600-\u06FF]{4,}/.test(text)) return true;
  if (/^[A-Za-z0-9\s.,;:'"?!\-]+$/.test(text) && text.length > 40) return true;
  return false;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

/** User message preview (conversations list). */
export function plainTextUserPreview(text: string, maxLen = 120): string {
  if (!text) return "";

  let s = text.trim();
  const markerIdx = s.indexOf(PROMPT_MARKER);
  if (markerIdx >= 0) s = s.slice(0, markerIdx).trim();

  if (s.includes("---")) {
    const tail = s.split("---").pop()?.trim();
    if (tail) s = tail;
  }

  for (const marker of INPUT_MARKERS) {
    const idx = s.indexOf(marker);
    if (idx >= 0) s = s.slice(0, idx).trim();
  }

  const lines: string[] = [];
  for (const line of s.split("\n")) {
    let t = line.trim();
    if (!t) continue;
    t = t.replace(HTML_COMMENT, "").trim();
    if (!t || JSON_LINE.test(t) || TECH_LINE.test(t) || t.startsWith("{")) continue;
    if (SYSTEM_JUNK.test(t) && !/[\u0600-\u06FF]/.test(t)) continue;
    lines.push(t);
  }

  s = collapseWs(stripMarkdown(lines.length ? lines.join(" ") : s.split("\n", 1)[0] ?? ""));
  if (isSystemOnlyJunk(s)) return "اجرای تست خودکار";
  return truncate(s, maxLen);
}

/** Assistant output preview (conversations + notifications). */
export function plainTextOutputPreview(text: string, maxLen = 120): string {
  if (!text) return "";

  let s = sanitizeChatMessage(text, "assistant");
  s = s.replace(/\/api\/v1\/demo-files\/[^\s)\]"']+/g, "فایل گزارش");
  s = s.replace(/https?:\/\/\S+/g, "لینک");
  s = collapseWs(stripMarkdown(s));
  if (isSystemOnlyJunk(s)) return "";
  return truncate(s, maxLen);
}

/** Any short UI preview line. */
export function plainTextPreview(text: string, maxLen = 120): string {
  if (!text) return "";
  const out = plainTextOutputPreview(text, maxLen);
  if (out) return out;
  return plainTextUserPreview(text, maxLen);
}
