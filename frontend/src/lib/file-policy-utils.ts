import type { AgentFilePolicy } from "@/types";

export function fileExtension(filename: string): string {
  const parts = filename.split(".");
  if (parts.length < 2) return "";
  return `.${parts.pop()!.toLowerCase()}`;
}

export function isFileAllowedByPolicy(
  file: Pick<File, "name" | "type" | "size">,
  policy: AgentFilePolicy
): boolean {
  if (policy.allow_all_types) return true;
  const ext = fileExtension(file.name);
  const mimeOk = Boolean(file.type) && policy.allowed_mime_types.includes(file.type);
  const extOk = policy.allowed_extensions.some(
    (e) => e.toLowerCase() === ext || e.toLowerCase() === ext.replace(/^\./, "")
  );
  return mimeOk || extOk;
}

export function validateFileAgainstPolicy(
  file: Pick<File, "name" | "type" | "size">,
  policy: AgentFilePolicy
): string | null {
  if (!isFileAllowedByPolicy(file, policy)) {
    return policy.allow_all_types
      ? `فایل «${file.name}» پذیرفته نشد`
      : `نوع فایل «${file.name}» مجاز نیست`;
  }
  const mb = file.size / (1024 * 1024);
  if (mb > policy.max_file_size_mb) {
    return `حجم «${file.name}» بیش از ${policy.max_file_size_mb}MB است`;
  }
  return null;
}

/** HTML accept attribute — undefined means all file types. */
export function filePolicyAcceptAttr(policy: AgentFilePolicy): string | undefined {
  if (policy.allow_all_types) return undefined;
  if (!policy.allowed_extensions.length) return undefined;
  return policy.allowed_extensions.join(",");
}

export function filePolicyTypeHint(policy: AgentFilePolicy): string {
  if (policy.allow_all_types) return "همه فرمت‌ها";
  if (!policy.allowed_extensions.length) return "طبق سیاست فایل";
  return policy.allowed_extensions.join("، ");
}
