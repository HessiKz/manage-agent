/**
 * Normalize LLM output before markdown rendering (Persian + common quirks).
 */

/** Unicode / typographic bullets → GFM list markers. */
const UNICODE_BULLET = /^[ \t]*[•●◦▪▫·‣⁃]\s+/gm;

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

const HR_CHARS = /^[ \t]*(?:-{3,}|\*{3,}|_{3,}|─{3,}|━{3,}|—{2,}|–{2,})[ \t]*$/gm;

const MARKDOWN_FENCE =
  /^```(?:markdown|md|text)?\s*\n([\s\S]*?)\n```\s*$/i;

/** Some models wrap the entire answer in a single code fence — unwrap so MD renders. */
function unwrapMarkdownCodeFence(text: string): string {
  const trimmed = text.trim();
  const full = trimmed.match(MARKDOWN_FENCE);
  if (full) return full[1].trim();

  const open = trimmed.match(/^```(?:markdown|md|text)?\s*\n([\s\S]+)$/i);
  if (open && !trimmed.endsWith("```")) {
    return open[1].trim();
  }
  return text;
}

function normalizeColons(text: string): string {
  return text.replace(/：/g, ":");
}

function normalizeHorizontalRules(text: string): string {
  return text.replace(HR_CHARS, "\n\n---\n\n");
}

function persianDigitToAscii(d: string): string {
  const idx = PERSIAN_DIGITS.indexOf(d);
  return idx >= 0 ? String(idx) : d;
}

function normalizeOrderedLists(text: string): string {
  return text.replace(
    /^([ \t]*)([۰-۹]+|[0-9]+)[.)]\s+/gm,
    (_match, indent: string, num: string) => {
      const ascii = num
        .split("")
        .map((d) => persianDigitToAscii(d))
        .join("");
      return `${indent}${ascii}. `;
    }
  );
}

function normalizeChecklistLines(text: string): string {
  let out = text;
  out = out.replace(/^[ \t]*[✓✔☑]\s+(.+)$/gm, "- [x] $1");
  out = out.replace(/^[ \t]*[☐○◯]\s+(.+)$/gm, "- [ ] $1");
  return out;
}

/** `Label: value` lines (2+) → markdown bullet list with bold labels. */
function convertLabelLinesToList(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  const isLabelLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") return false;
    if (/^[-*+]/.test(trimmed)) return false;
    if (/^#{1,6}\s/.test(trimmed)) return false;
    if (/^>\s/.test(trimmed)) return false;
    if (/^\d+[.)]\s/.test(trimmed)) return false;
    if (/^```/.test(trimmed)) return false;
    return /^[^|\n]{1,60}?:\s*\S/.test(trimmed);
  };

  while (i < lines.length) {
    if (isLabelLine(lines[i])) {
      const block: string[] = [];
      let j = i;
      while (j < lines.length && isLabelLine(lines[j])) {
        const trimmed = lines[j].trim();
        const colon = trimmed.indexOf(":");
        const label = trimmed.slice(0, colon).trim();
        const value = trimmed.slice(colon + 1).trim();
        block.push(`- **${label}**: ${value}`);
        j++;
      }
      if (block.length >= 2) {
        if (out.length > 0 && out[out.length - 1].trim()) out.push("");
        out.push(...block);
        i = j;
        continue;
      }
    }
    out.push(lines[i]);
    i++;
  }
  return out.join("\n");
}

/** Short standalone lines before a list/block → ### heading. */
function promoteSectionTitles(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const next = lines[i + 1]?.trim() ?? "";

    const looksLikeTitle =
      trimmed.length >= 4 &&
      trimmed.length <= 72 &&
      !trimmed.endsWith(".") &&
      !trimmed.endsWith("؟") &&
      !trimmed.endsWith("!") &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("*") &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith(">") &&
      !trimmed.includes(":") &&
      !/^\d+[.)]/.test(trimmed) &&
      (next === "---" ||
        next.startsWith("- ") ||
        next.startsWith("* ") ||
        /^\d+[.)]/.test(next) ||
        next.startsWith("**"));

    if (looksLikeTitle) {
      if (out.length > 0 && out[out.length - 1].trim()) out.push("");
      out.push(`### ${trimmed}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

function ensureListSpacing(text: string): string {
  return text.replace(/([^\n])\n([ \t]*[-*+]\s)/g, "$1\n\n$2");
}

function ensureHrSpacing(text: string): string {
  return text
    .replace(/([^\n])\n(---)\n/g, "$1\n\n$2\n\n")
    .replace(/\n(---)\n([^\n])/g, "\n$1\n\n$2");
}

function tightenBoldMarkers(text: string): string {
  return text
    .replace(/\*\*\s+([^*]+?)\s+\*\*/g, "**$1**")
    .replace(/__\s+([^_]+?)\s+__/g, "__$1__");
}

/**
 * GFM requires whitespace after a closing `**` when the next character is non-space.
 * Models often emit `**خلاصه:**5` — without a gap it stays literal asterisks.
 */
function fixInlineBoldColonSpacing(text: string): string {
  return text.replace(/\*\*([^*\n]{1,80}?):\*\*(\S)/g, "**$1:** $2");
}

/**
 * Models often emit `-**Label:** value` (no space, colon inside bold, no close `**`).
 * GFM needs `- **Label**: value` so react-markdown renders bold labels.
 */
function fixMalformedListBold(text: string): string {
  return text
    .replace(/^([ \t]*[-*+])\s*\*\*([^*\n:]+?):\*\*\s+/gm, "$1 **$2**: ")
    .replace(/^([ \t]*[-*+])\s*\*\*([^*\n:]+?):\*\*(\S)/gm, "$1 **$2**: $3")
    .replace(/^([ \t]*[-*+])\s*\*\*([^*\n:]+?):\s+/gm, "$1 **$2**: ")
    .replace(/^([ \t]*[-*+])\*\*([^*\n:]+?):\s*/gm, "$1 **$2**: ");
}

export function normalizeChatMarkdown(text: string): string {
  if (!text) return text;

  let out = text.replace(/\r\n/g, "\n");
  out = unwrapMarkdownCodeFence(out);
  out = normalizeColons(out);
  out = normalizeHorizontalRules(out);
  out = out.replace(UNICODE_BULLET, "- ");
  out = normalizeOrderedLists(out);
  out = normalizeChecklistLines(out);
  out = fixMalformedListBold(out);
  out = fixInlineBoldColonSpacing(out);
  out = convertLabelLinesToList(out);
  out = promoteSectionTitles(out);
  out = tightenBoldMarkers(out);
  out = ensureListSpacing(out);
  out = ensureHrSpacing(out);
  out = out.replace(/\n{4,}/g, "\n\n\n").trim();
  return out;
}

/** True when text likely benefits from markdown rendering. */
export function looksLikeFormattedChat(text: string): boolean {
  if (!text) return false;
  if (/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/m.test(text)) return true;
  if (/^#{1,6}\s/m.test(text)) return true;
  if (/^\s*[-*+]\s/m.test(text)) return true;
  if (/^\s*\d+[.)]\s/m.test(text)) return true;
  if (/\*\*[^*]+\*\*/.test(text)) return true;
  if (/`[^`]+`/.test(text)) return true;
  if (/^\s*>\s/m.test(text)) return true;
  if (/^\s*\|.+?\|/m.test(text)) return true;
  if (/~~[^~]+~~/.test(text)) return true;
  if (/^[ \t]*[•●◦▪▫·‣⁃]\s+/m.test(text)) return true;
  return false;
}
