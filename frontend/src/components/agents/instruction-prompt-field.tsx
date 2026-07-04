"use client";

import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Paperclip, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { easeOut } from "@/components/motion/variants";
import { appAlert } from "@/lib/app-dialog";
import {
  asInstructionFile,
  displayAgentFileName,
  isInstructionFileName,
} from "@/lib/agent-file-roles";
import { validateFileAgainstPolicy, filePolicyAcceptAttr } from "@/lib/file-policy-utils";
import type { AgentFilePolicy } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type Props = {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  filePolicy: AgentFilePolicy;
  onSuggest?: () => void;
  suggesting?: boolean;
  suggestDisabled?: boolean;
  textareaSupportId?: string;
};

export function InstructionPromptField({
  label,
  hint,
  placeholder,
  value,
  onChange,
  files,
  onFilesChange,
  filePolicy,
  onSuggest,
  suggesting = false,
  suggestDisabled = false,
  textareaSupportId,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          message: `حداکثر ${filePolicy.max_files} فایل پیوست مجاز است`,
        });
        break;
      }
      const normalized = asInstructionFile(file);
      if (next.some((f) => f.name === normalized.name && f.size === normalized.size)) continue;
      next.push(normalized);
    }
    onFilesChange(next);
  }

  function removeAt(index: number) {
    onFilesChange(files.filter((_, i) => i !== index));
  }

  const referenceFiles = files.filter((f) => isInstructionFileName(f.name));

  return (
    <motion.div
      className="overflow-hidden rounded-2xl border border-brand-200/50 bg-white shadow-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: easeOut }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border bg-gradient-to-l from-brand-50/60 to-white px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">{label}</p>
          <p className="mt-1 text-xs leading-relaxed text-stone-600">{hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="secondary"
            className="h-9 w-9 p-0"
            title="پیوست فایل دستورالعمل"
            aria-label="پیوست فایل دستورالعمل"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          {onSuggest && (
            <Button
              type="button"
              variant="secondary"
              className="h-9 gap-1.5 px-3 text-xs"
              disabled={suggestDisabled || suggesting}
              onClick={onSuggest}
            >
              {suggesting ? (
                <LoadingSpinner />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              پیشنهاد متن
            </Button>
          )}
        </div>
      </div>

      <div className="p-4">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={7}
          placeholder={placeholder}
          data-ma-support={textareaSupportId}
          className="min-h-[9rem] resize-y border-0 bg-stone-50/40 px-3 py-3 text-sm leading-relaxed shadow-none ring-0 focus:bg-white focus:ring-2 focus:ring-brand-200"
        />

        <AnimatePresence>
          {referenceFiles.length > 0 && (
            <motion.div
              className="mt-3 border-t border-stone-100 pt-3"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: easeOut }}
            >
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                فایل‌های دستورالعمل ({referenceFiles.length})
              </p>
              <Stagger initial={false} className="flex flex-wrap gap-2">
                {referenceFiles.map((f) => {
                  const idx = files.indexOf(f);
                  return (
                    <StaggerItem key={`${f.name}-${f.size}-ref`} variant="scaleIn">
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 py-1 pe-1 ps-3 text-xs font-medium text-stone-700">
                        <span className="truncate">{displayAgentFileName(f.name)}</span>
                        <button
                          type="button"
                          className="rounded-full p-0.5 text-stone-400 hover:bg-stone-200 hover:text-stone-800"
                          onClick={() => removeAt(idx)}
                          aria-label={`حذف ${displayAgentFileName(f.name)}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    </StaggerItem>
                  );
                })}
              </Stagger>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={filePolicyAcceptAttr(filePolicy)}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </motion.div>
  );
}