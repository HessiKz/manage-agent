import { displayAgentFileName, isInstructionFileName } from "@/lib/agent-file-roles";

const MAX_FILE_TEXT_CHARS = 24_000;
const MAX_TOTAL_TEXT_CHARS = 48_000;

function isRuntimeInputFile(name: string): boolean {
  return (
    !isInstructionFileName(name) &&
    !name.startsWith("output__")
  );
}

function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}\n[... متن کوتاه شد ...]`;
}

export async function extractInstructionFileTexts(files: File[]): Promise<string[]> {
  const blocks: string[] = [];
  let used = 0;
  for (const file of files) {
    if (!isInstructionFileName(file.name)) continue;
    if (!/^text\//i.test(file.type) && !/\.(txt|csv|md|json)$/i.test(file.name)) {
      blocks.push(`فایل دستورالعمل: ${displayAgentFileName(file.name)}\n[متن در مرورگر قابل استخراج نبود؛ سرور هنگام ذخیره فایل را می‌خواند.]`);
      continue;
    }
    const remaining = Math.max(0, MAX_TOTAL_TEXT_CHARS - used);
    if (remaining <= 0) break;
    const text = (await file.text()).trim();
    if (!text) continue;
    const clipped = clip(text, Math.min(MAX_FILE_TEXT_CHARS, remaining));
    used += clipped.length;
    blocks.push(`فایل دستورالعمل: ${displayAgentFileName(file.name)}\n${clipped}`);
  }
  return blocks;
}

/** Runtime upload files (excludes instruction/output samples) for preview invoke context. */
export async function extractRuntimeFileContext(files: File[]): Promise<string | undefined> {
  const blocks: string[] = [];
  let used = 0;
  for (const file of files) {
    if (!isRuntimeInputFile(file.name)) continue;
    if (!/^text\//i.test(file.type) && !/\.(txt|csv|md|json)$/i.test(file.name)) {
      blocks.push(
        `فایل ورودی: ${displayAgentFileName(file.name)}\n[متن در مرورگر قابل استخراج نبود.]`
      );
      continue;
    }
    const remaining = Math.max(0, MAX_TOTAL_TEXT_CHARS - used);
    if (remaining <= 0) break;
    const text = (await file.text()).trim();
    if (!text) continue;
    const clipped = clip(text, Math.min(MAX_FILE_TEXT_CHARS, remaining));
    used += clipped.length;
    blocks.push(`فایل ورودی: ${displayAgentFileName(file.name)}\n${clipped}`);
  }
  return blocks.length ? blocks.join("\n\n") : undefined;
}
