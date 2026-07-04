export const INSTRUCTION_FILE_PREFIX = "instruction__";
export const OUTPUT_SAMPLE_PREFIX = "output-sample__";

export function isOutputSampleFileName(name: string): boolean {
  return name.startsWith(OUTPUT_SAMPLE_PREFIX) || name.includes(OUTPUT_SAMPLE_PREFIX);
}

export function isInstructionFileName(name: string): boolean {
  return name.startsWith(INSTRUCTION_FILE_PREFIX) || name.includes(INSTRUCTION_FILE_PREFIX);
}

export function isRuntimeSampleFileName(name: string): boolean {
  return !isInstructionFileName(name) && !isOutputSampleFileName(name);
}

export function displayAgentFileName(name: string): string {
  if (isInstructionFileName(name)) return name.slice(INSTRUCTION_FILE_PREFIX.length);
  if (isOutputSampleFileName(name)) return name.slice(OUTPUT_SAMPLE_PREFIX.length);
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
