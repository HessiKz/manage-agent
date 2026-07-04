"use client";

import { Textarea } from "@/components/ui/input";
import { WizardStagedFiles } from "@/components/agents/wizard-staged-files";
import type { AgentFilePolicy } from "@/types";

export type IoExamples = {
  inputText: string;
  outputText: string;
};

type Props = {
  stagedFiles: File[];
  onFilesChange: (files: File[]) => void;
  filePolicy: AgentFilePolicy;
  ioExamples: IoExamples;
  onIoExamplesChange: (next: IoExamples) => void;
};

export function WizardIoPanel({
  stagedFiles,
  onFilesChange,
  filePolicy,
  ioExamples,
  onIoExamplesChange,
}: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="space-y-3 rounded-2xl border border-stone-200 bg-stone-50/50 p-4">
        <h4 className="text-sm font-bold text-stone-800">خروجی ایجنت</h4>
        <p className="text-xs text-stone-500">نمونه خروجی مورد انتظار — متن یا فایل</p>
        <Textarea
          rows={3}
          placeholder="مثال خروجی یا توضیح فرمت…"
          value={ioExamples.outputText}
          onChange={(e) =>
            onIoExamplesChange({ ...ioExamples, outputText: e.target.value })
          }
        />
        <WizardStagedFiles
          files={stagedFiles}
          onChange={onFilesChange}
          filePolicy={filePolicy}
          mode="output"
          title="فایل نمونه خروجی"
        />
      </section>
      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
        <h4 className="text-sm font-bold text-stone-800">ورودی ایجنت</h4>
        <p className="text-xs text-stone-500">نمونه ورودی — متن یا فایل</p>
        <Textarea
          rows={3}
          placeholder="مثال ورودی یا داده نمونه…"
          value={ioExamples.inputText}
          onChange={(e) =>
            onIoExamplesChange({ ...ioExamples, inputText: e.target.value })
          }
        />
        <WizardStagedFiles
          files={stagedFiles}
          onChange={onFilesChange}
          filePolicy={filePolicy}
          mode="input"
          title="فایل نمونه ورودی"
        />
      </section>
    </div>
  );
}
