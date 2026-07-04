import {
  isInstructionFileName,
  isOutputSampleFileName,
  isRuntimeSampleFileName,
} from "@/lib/agent-file-roles";
import type { AgentAction, AgentCapabilities, AgentKind } from "@/types";

/** Mirrors backend BUILTIN_FILE_TOOLS — agents with these skip script synthesis. */
const BUILTIN_FILE_TOOLS = new Set(["karkard_process"]);

const SCRIPT_WORKER_KINDS = new Set(["worker", "file_intake", "spreadsheet"]);

export type ScriptSampleGap = "input" | "output";

export function agentLikelyNeedsScript(
  kind: AgentKind,
  caps: AgentCapabilities,
  toolNames: string[],
  actions: Pick<AgentAction, "tool_chain">[]
): boolean {
  const declared = [
    ...toolNames,
    ...actions.flatMap((a) => a.tool_chain ?? []),
  ];
  if (declared.some((t) => BUILTIN_FILE_TOOLS.has(t))) return false;
  if (!caps.file_upload_enabled) return false;
  return SCRIPT_WORKER_KINDS.has(kind as string);
}

export function missingScriptSampleGaps(files: File[]): ScriptSampleGap[] {
  const gaps: ScriptSampleGap[] = [];
  if (!files.some((f) => isRuntimeSampleFileName(f.name))) gaps.push("input");
  if (!files.some((f) => isOutputSampleFileName(f.name))) gaps.push("output");
  return gaps;
}

export function scriptSamplesPublishBlock(
  kind: AgentKind,
  caps: AgentCapabilities,
  toolNames: string[],
  actions: Pick<AgentAction, "tool_chain">[],
  files: File[]
): { title: string; message: string; step: string; fallback?: string } | null {
  if (!agentLikelyNeedsScript(kind, caps, toolNames, actions)) return null;
  const gaps = missingScriptSampleGaps(files);
  if (!gaps.length) return null;

  const hasInstruction = files.some((f) => isInstructionFileName(f.name));
  const parts: string[] = [];
  if (gaps.includes("input")) {
    parts.push("• فایل نمونه ورودی (همان فایل خام کاربر) — در مرحله «فایل و سیاست»");
  }
  if (gaps.includes("output")) {
    parts.push("• فایل نمونه خروجی مورد انتظار — با آیکن اکسل در «منطق و دستور»");
  }

  const intro = hasInstruction
    ? "فایل دستورالعمل (مرجع) را داده‌اید، اما برای ایجنت‌های پردازش فایل علاوه بر آن این‌ها هم لازم است:\n\n"
    : "برای ایجنت‌های پردازش فایل قبل از انتشار این فایل‌ها لازم است:\n\n";

  const step = gaps.includes("input") ? "فایل و سیاست" : "منطق و دستور";
  return {
    title: "فایل‌های نمونه پردازش",
    message: intro + parts.join("\n"),
    step,
    fallback: gaps.includes("output") ? "منطق و دستور" : undefined,
  };
}
