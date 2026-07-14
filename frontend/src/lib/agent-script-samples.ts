import {
  isInstructionFileName,
  isOutputSampleFileName,
  isTrainingInputFileName,
} from "@/lib/agent-file-roles";
import type { AgentAction, AgentCapabilities, AgentFile, AgentKind } from "@/types";

/** Mirrors backend BUILTIN_FILE_TOOLS — empty: all file processing uses scripts. */
const BUILTIN_FILE_TOOLS = new Set<string>();

const SCRIPT_WORKER_KINDS = new Set(["worker", "file_intake", "spreadsheet"]);

export type ScriptSampleGap = "input" | "output";

/** Any file-like with a name (+ optional DB role) for sample checks. */
export type SampleFileRef = {
  name: string;
  role?: string | null;
};

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
  if (SCRIPT_WORKER_KINDS.has(kind as string)) return true;
  if (declared.includes("run_agent_script")) return true;
  return Boolean(caps.file_upload_enabled && (kind as string) !== "chat");
}

function asRef(file: File | SampleFileRef | AgentFile): SampleFileRef {
  if (file instanceof File) return { name: file.name };
  if ("filename" in file && typeof (file as AgentFile).filename === "string") {
    const af = file as AgentFile;
    return { name: af.filename, role: af.role };
  }
  return file as SampleFileRef;
}

export function missingScriptSampleGaps(
  files: Array<File | SampleFileRef | AgentFile>
): ScriptSampleGap[] {
  const refs = files.map(asRef);
  const gaps: ScriptSampleGap[] = [];
  if (!refs.some((f) => isTrainingInputFileName(f.name, f.role))) gaps.push("input");
  if (!refs.some((f) => isOutputSampleFileName(f.name, f.role))) gaps.push("output");
  return gaps;
}

export function scriptSamplesPublishBlock(
  kind: AgentKind,
  caps: AgentCapabilities,
  toolNames: string[],
  actions: Pick<AgentAction, "tool_chain">[],
  files: Array<File | SampleFileRef | AgentFile>
): { title: string; message: string; step: string; fallback?: string } | null {
  if (!agentLikelyNeedsScript(kind, caps, toolNames, actions)) return null;
  const gaps = missingScriptSampleGaps(files);
  if (!gaps.length) return null;

  const refs = files.map(asRef);
  const hasInstruction = refs.some((f) => isInstructionFileName(f.name, f.role));
  const parts: string[] = [];
  if (gaps.includes("input")) {
    parts.push("• فایل نمونه ورودی (همان فایل خام کاربر) — در مرحله «ورودی و خروجی»");
  }
  if (gaps.includes("output")) {
    parts.push("• فایل نمونه خروجی مورد انتظار — در مرحله «ورودی و خروجی»");
  }

  const intro = hasInstruction
    ? "فایل دستورالعمل (مرجع) را داده‌اید، اما برای ایجنت‌های پردازش فایل علاوه بر آن این‌ها هم لازم است:\n\n"
    : "برای ایجنت‌های پردازش فایل قبل از انتشار این فایل‌ها لازم است:\n\n";

  return {
    title: "فایل‌های نمونه پردازش",
    message: intro + parts.join("\n"),
    step: "ورودی و خروجی",
    fallback: "ورودی و خروجی",
  };
}
