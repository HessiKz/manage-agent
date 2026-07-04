"use client";

import { Upload, X } from "lucide-react";
import { appAlert } from "@/lib/app-dialog";
import {
  asOutputSampleFile,
  displayAgentFileName,
  isOutputSampleFileName,
  isRuntimeSampleFileName,
} from "@/lib/agent-file-roles";
import {
  validateFileAgainstPolicy,
  filePolicyAcceptAttr,
  filePolicyTypeHint,
} from "@/lib/file-policy-utils";
import type { AgentFilePolicy } from "@/types";

type Props = {
  files: File[];
  onChange: (files: File[]) => void;
  filePolicy: AgentFilePolicy;
  mode?: "input" | "output" | "legacy";
  optional?: boolean;
  title?: string;
  description?: string;
};

export function validateStagedFile(file: File, policy: AgentFilePolicy): string | null {
  return validateFileAgainstPolicy(file, policy);
}

export function WizardStagedFiles({
  files,
  onChange,
  filePolicy,
  mode = "legacy",
  optional = true,
  title,
  description,
}: Props) {
  const visibleFiles =
    mode === "output"
      ? files.filter((f) => isOutputSampleFileName(f.name))
      : mode === "input"
        ? files.filter((f) => isRuntimeSampleFileName(f.name))
        : files.filter((f) => isRuntimeSampleFileName(f.name));

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const next = [...files];
    for (const file of Array.from(fileList)) {
      const err = validateFileAgainstPolicy(file, filePolicy);
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
      const normalized =
        mode === "output" ? asOutputSampleFile(file) : file;
      if (
        next.some((f) => f.name === normalized.name && f.size === normalized.size)
      )
        continue;
      next.push(normalized);
    }
    onChange(next);
  }

  function removeAt(index: number) {
    const target = visibleFiles[index];
    if (!target) return;
    onChange(files.filter((f) => f !== target));
  }

  const defaultTitle =
    mode === "input"
      ? "فایل ورودی نمونه"
      : mode === "output"
        ? "فایل خروجی نمونه (مورد انتظار)"
        : optional
          ? "فایل نمونه برای قالب خروجی (اختیاری)"
          : "فایل نمونه";

  const defaultDescription =
    mode === "input"
      ? "فایل خام یا ورودی واقعی که کاربر آپلود می‌کند (مثلاً اکسل کارکرد)."
      : mode === "output"
        ? "نمونه خروجی مورد انتظار — مثلاً فایل پردازش‌شده خانم فاطمی."
        : optional
          ? "اگر ایجنت باید فرمت خاصی را دنبال کند، یک فایل نمونه بگذارید."
          : "فایل نمونه بعد از انتشار به ایجنت پیوست می‌شود.";

  const hint = `${filePolicyTypeHint(filePolicy)} · حداکثر ${filePolicy.max_file_size_mb}MB`;

  return (
    <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50/50 p-4">
      <div>
        <p className="text-sm font-semibold text-stone-800">{title ?? defaultTitle}</p>
        <p className="mt-1 text-xs leading-relaxed text-stone-500">
          {description ?? defaultDescription}
        </p>
        <p className="mt-1 text-xs text-stone-400">{hint}</p>
      </div>

      <label className="flex cursor-pointer items-center justify-between rounded-xl border border-dashed border-stone-300 bg-white p-3 hover:border-brand-300 hover:bg-brand-50/30">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <Upload className="h-4 w-4 text-brand-600" />
          انتخاب فایل
        </div>
        <span className="text-xs text-stone-400">{visibleFiles.length} فایل</span>
        <input
          type="file"
          multiple
          className="hidden"
          accept={filePolicyAcceptAttr(filePolicy)}
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </label>

      {visibleFiles.length > 0 && (
        <ul className="space-y-2">
          {visibleFiles.map((f, i) => (
            <li
              key={`${f.name}-${f.size}-${i}`}
              className="flex items-center justify-between rounded-lg border border-stone-100 bg-white px-3 py-2 text-xs"
            >
              <span className="truncate font-medium text-stone-700">
                {displayAgentFileName(f.name)}
              </span>
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
