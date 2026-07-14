export const INSTRUCTION_FILE_PREFIX = "instruction__";
export const OUTPUT_SAMPLE_PREFIX = "output-sample__";
export const INPUT_SAMPLE_PREFIX = "input-sample__";

export type AgentFileRole =
  | "instruction"
  | "output_sample"
  | "input_sample"
  | "runtime";

export function isOutputSampleFileName(name: string, role?: string | null): boolean {
  if (role === "output_sample") return true;
  return name.startsWith(OUTPUT_SAMPLE_PREFIX) || name.includes(OUTPUT_SAMPLE_PREFIX);
}

export function isInstructionFileName(name: string, role?: string | null): boolean {
  if (role === "instruction") return true;
  return name.startsWith(INSTRUCTION_FILE_PREFIX) || name.includes(INSTRUCTION_FILE_PREFIX);
}

export function isInputSampleFileName(name: string, role?: string | null): boolean {
  if (role === "input_sample") return true;
  return name.startsWith(INPUT_SAMPLE_PREFIX) || name.includes(INPUT_SAMPLE_PREFIX);
}

/** Unprefixed runtime / training inputs (not instruction or output-sample). */
export function isRuntimeSampleFileName(name: string, role?: string | null): boolean {
  if (role === "runtime" || role === "input_sample") return true;
  if (role === "instruction" || role === "output_sample") return false;
  return !isInstructionFileName(name) && !isOutputSampleFileName(name);
}

/** Training / verify input samples: input-sample__ or unprefixed runtime files. */
export function isTrainingInputFileName(name: string, role?: string | null): boolean {
  return isRuntimeSampleFileName(name, role);
}

export function agentFileRoleFromName(name: string, role?: string | null): AgentFileRole {
  if (role === "instruction" || role === "output_sample" || role === "input_sample" || role === "runtime") {
    return role;
  }
  if (isInstructionFileName(name)) return "instruction";
  if (isOutputSampleFileName(name)) return "output_sample";
  if (isInputSampleFileName(name)) return "input_sample";
  return "runtime";
}

/** Server-side agent file helpers (use role column when present). */
export function isServerInstructionFile(file: { filename: string; role?: string | null }): boolean {
  return isInstructionFileName(file.filename, file.role);
}

export function isServerOutputSampleFile(file: { filename: string; role?: string | null }): boolean {
  return isOutputSampleFileName(file.filename, file.role);
}

export function isServerInputSampleFile(file: { filename: string; role?: string | null }): boolean {
  return isRuntimeSampleFileName(file.filename, file.role);
}

export function displayAgentFileName(name: string): string {
  for (const prefix of [INSTRUCTION_FILE_PREFIX, OUTPUT_SAMPLE_PREFIX, INPUT_SAMPLE_PREFIX]) {
    if (name.startsWith(prefix)) return name.slice(prefix.length);
    const i = name.indexOf(prefix);
    if (i >= 0) return name.slice(i + prefix.length);
  }
  return name;
}

export function asInstructionFile(file: File): File {
  if (isInstructionFileName(file.name)) return file;
  return new File([file], `${INSTRUCTION_FILE_PREFIX}${file.name}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function asOutputSampleFile(file: File): File {
  if (isOutputSampleFileName(file.name)) return file;
  return new File([file], `${OUTPUT_SAMPLE_PREFIX}${file.name}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function asInputSampleFile(file: File): File {
  if (isInputSampleFileName(file.name)) return file;
  if (isInstructionFileName(file.name) || isOutputSampleFileName(file.name)) return file;
  return new File([file], `${INPUT_SAMPLE_PREFIX}${file.name}`, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function roleBadgeLabel(role: AgentFileRole): string {
  switch (role) {
    case "instruction":
      return "دستورالعمل";
    case "output_sample":
      return "نمونه خروجی";
    case "input_sample":
      return "نمونه ورودی";
    default:
      return "فایل";
  }
}
