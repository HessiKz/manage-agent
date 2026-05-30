"use client";

import { Upload, X } from "lucide-react";
import { appAlert } from "@/lib/app-dialog";
import type { AgentFilePolicy } from "@/types";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  filePolicy: AgentFilePolicy;
  /** When true, copy explains files are optional format examples. */
  optional?: boolean;
  title?: string;
  description?: string;
};

function validateFile(file: File, policy: AgentFilePolicy): string | null {
  const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
  const mimeOk = policy.allowed_mime_types.includes(file.type);
  const extOk = policy.allowed_extensions.some(
    (e) => e.toLowerCase() === ext || e.toLowerCase() === ext.replace(/^\./, "")
  );
  if (!mimeOk && !extOk) return `نوع فایل «${file.name}» مجاز نیست`;
  const mb = file.size / (1024 * 1024);
  if (mb > policy.max_file_size_mb) {
    return `حجم «${file.name}» بیش از ${policy.max_file_size_mb}MB است`;
  }
  return null;
}

export function WizardStagedFiles({
  files,
  onChange,
  filePolicy,
  optional = true,
  title,
  description,
}: Props) {
  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = [...files];
    for (const file of Array.from(fileList)) {
      const err = validateFile(file, filePolicy);
      if (err) {
        void appAlert({ title: "فایل نامعتبر", message: err, tone: "danger" });
        continue;
      }
      if (next.length >= filePolicy.max_files) {
        void appAlert({
          title: "محدودیت فایل",
          message: `حداکثر ${filePolicy.max_files} فایل مجاز است`,
        });
        break;
      }
      if (next.some((f) => f.name === file.name && f.size === file.size)) continue;
      next.push(file);
    }
    onChange(next);
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  const hint = `${filePolicy.allowed_extensions.join("، ")} · حداکثر ${filePolicy.max_file_size_mb}MB`;

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/50 p-4">
      <div>
        <p className="text-sm font-semibold text-stone-800">
          {title ?? (optional ? "فایل نمونه برای قالب خروجی (اختیاری)" : "فایل نمونه")}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">
          {description ??
            (optional
              ? "اگر ایجنت باید فرمت خاصی (مثلاً اکسل کارکرد) را دنبال کند، یک فایل نمونه بگذارید. بدون فایل هم می‌توانید ادامه دهید."
              : "فایل نمونه بعد از انتشار به ایجنت پیوست می‌شود تا در اجرا از همان قالب استفاده کند.")}
        </p>
        <p className="mt-1 text-xs text-stone-400">{hint}</p>
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-stone-300 bg-white p-3 hover:border-brand-300 hover:bg-brand-50/30">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <Upload className="h-4 w-4 text-brand-600" />
          انتخاب فایل
        </div>
        <span className="text-xs text-stone-400">{files.length} فایل</span>
        <input
          type="file"
          multiple
          className="hidden"
          accept={filePolicy.allowed_extensions.join(",")}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="flex items-center justify-between rounded-lg border border-stone-100 bg-white px-3 py-2 text-xs"
            >
              <span className="truncate font-medium text-stone-700">{f.name}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-stone-400">{Math.round(f.size / 1024)}KB</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                  onClick={() => removeAt(i)}
                  aria-label="حذف فایل"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
