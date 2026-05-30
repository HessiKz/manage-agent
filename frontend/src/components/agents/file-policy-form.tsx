"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { MIME_CHIPS } from "@/lib/agent-presets";
import { cn } from "@/lib/utils";
import type { AgentFilePolicy } from "@/types";

type Props = {
  value: AgentFilePolicy;
  onChange: (policy: AgentFilePolicy) => void;
};

export function validateFilePolicy(policy: AgentFilePolicy): string | null {
  if (policy.min_files > policy.max_files) return "حداقل فایل باید کمتر از حداکثر باشد";
  if (policy.max_file_size_mb > policy.max_total_size_mb) {
    return "حداکثر حجم هر فایل نباید از کل سقف بیشتر باشد";
  }
  if (!policy.allowed_mime_types.length && !policy.allowed_extensions.length) {
    return "حداقل یک نوع فایل مجاز انتخاب کنید";
  }
  return null;
}

export function FilePolicyForm({ value, onChange }: Props) {
  const error = useMemo(() => validateFilePolicy(value), [value]);

  function toggleMime(mime: string, ext: string) {
    const has = value.allowed_mime_types.includes(mime);
    if (has) {
      onChange({
        ...value,
        allowed_mime_types: value.allowed_mime_types.filter((m) => m !== mime),
        allowed_extensions: value.allowed_extensions.filter((e) => e !== ext),
      });
    } else {
      onChange({
        ...value,
        allowed_mime_types: [...value.allowed_mime_types, mime],
        allowed_extensions: [...value.allowed_extensions, ext],
      });
    }
  }

  return (
    <Stagger initial={false} className="space-y-4">
      <StaggerItem variant="slideUp">
        <p className="text-xs leading-relaxed text-stone-500">
          کاربران فقط می‌توانند فرمت‌هایی را بفرستند که اینجا مجاز کرده‌اید. اعداد زیر سقف
          امنیتی آپلود هستند.
        </p>
      </StaggerItem>
      <StaggerItem variant="slideUp">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-stone-800">حداقل تعداد فایل</label>
            <p className="mb-1 text-xs text-stone-500">برای اجرا حداقل چند فایل لازم است.</p>
            <Input
              type="number"
              min={0}
              max={10000}
              value={value.min_files}
              onChange={(e) => onChange({ ...value, min_files: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-800">حداکثر تعداد فایل</label>
            <p className="mb-1 text-xs text-stone-500">سقف تعداد فایل در هر بار آپلود.</p>
            <Input
              type="number"
              min={1}
              max={10000}
              value={value.max_files}
              onChange={(e) => onChange({ ...value, max_files: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-800">حداکثر حجم هر فایل (مگابایت)</label>
            <p className="mb-1 text-xs text-stone-500">فایل بزرگ‌تر رد می‌شود.</p>
            <Input
              type="number"
              min={1}
              max={500}
              value={value.max_file_size_mb}
              onChange={(e) => onChange({ ...value, max_file_size_mb: Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-stone-800">حداکثر حجم کل (مگابایت)</label>
            <p className="mb-1 text-xs text-stone-500">مجموع همه فایل‌های یک بار آپلود.</p>
            <Input
              type="number"
              min={1}
              max={50000}
              value={value.max_total_size_mb}
              onChange={(e) => onChange({ ...value, max_total_size_mb: Number(e.target.value) })}
            />
          </div>
        </div>
      </StaggerItem>

      <StaggerItem variant="slideUp">
        <p className="text-sm font-semibold text-stone-800">نوع فایل مجاز</p>
        <p className="text-xs text-stone-500">روی هر نوع کلیک کنید تا فعال یا غیرفعال شود.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MIME_CHIPS.map(({ mime, ext, label }) => {
            const on = value.allowed_mime_types.includes(mime);
            return (
              <button
                key={mime}
                type="button"
                onClick={() => toggleMime(mime, ext)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150",
                  on ? "bg-brand-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-brand-50"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </StaggerItem>

      <StaggerItem variant="slideUp" className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.require_files_to_invoke}
            onChange={(e) =>
              onChange({ ...value, require_files_to_invoke: e.target.checked })
            }
            className="accent-brand-600"
          />
          بدون فایل آپلودشده اجرا نشود
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.auto_ingest_to_rag}
            onChange={(e) => onChange({ ...value, auto_ingest_to_rag: e.target.checked })}
            className="accent-brand-600"
          />
          <span>
            <span className="font-medium text-stone-700">ذخیره در پایگاه دانش</span>
            <span className="mr-1 text-stone-500">— برای جستجو در گفت‌وگو</span>
          </span>
        </label>
      </StaggerItem>

      {error && <p className="text-sm text-accent-red">{error}</p>}
    </Stagger>
  );
}
