"use client";

import { Textarea } from "@/components/ui/input";
import { FileIntakePanel } from "@/components/agents/file-intake-panel";
import { WizardStagedFiles } from "@/components/agents/wizard-staged-files";
import { FilePolicyForm } from "@/components/agents/file-policy-form";
import {
  isServerInputSampleFile,
  isServerOutputSampleFile,
} from "@/lib/agent-file-roles";
import type { AgentFilePolicy, IoFilePolicy } from "@/types";

export type IoExamples = {
  inputText: string;
  outputText: string;
};

type Props = {
  stagedFiles: File[];
  onFilesChange: (files: File[]) => void;
  filePolicy: IoFilePolicy;
  onFilePolicyChange: (next: IoFilePolicy) => void;
  ioExamples: IoExamples;
  onIoExamplesChange: (next: IoExamples) => void;
  /** When set (edit mode), show files already stored on the agent. */
  agentId?: string | null;
};

export function WizardIoPanel({
  stagedFiles,
  onFilesChange,
  filePolicy,
  onFilePolicyChange,
  ioExamples,
  onIoExamplesChange,
  agentId,
}: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
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
        {agentId ? (
          <FileIntakePanel
            agentId={agentId}
            filePolicy={filePolicy.input}
            title="فایل‌های ورودی ذخیره‌شده"
            description="نمونه‌های ورودی که قبلاً روی این ایجنت آپلود شده‌اند. افزودن/حذف فوری است."
            emptyText="هنوز فایل ورودی روی این ایجنت نیست"
            filter={(f) => isServerInputSampleFile(f)}
          />
        ) : null}
        <WizardStagedFiles
          files={stagedFiles}
          onChange={onFilesChange}
          filePolicy={filePolicy.input}
          mode="input"
          title={agentId ? "صف آپلود ورودی (بعد از ذخیره)" : "فایل نمونه ورودی"}
        />
        <div className="border-t border-stone-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-stone-600">خط‌مشی ورودی</p>
          <FilePolicyForm
            value={filePolicy.input}
            onChange={(p) => onFilePolicyChange({ ...filePolicy, input: p })}
            mode="input"
          />
        </div>
      </section>
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
        {agentId ? (
          <FileIntakePanel
            agentId={agentId}
            filePolicy={filePolicy.output}
            title="فایل‌های خروجی ذخیره‌شده"
            description="نمونه خروجی طلایی که قبلاً آپلود شده است. افزودن/حذف فوری است."
            emptyText="هنوز نمونه خروجی روی این ایجنت نیست"
            filter={(f) => isServerOutputSampleFile(f)}
          />
        ) : null}
        <WizardStagedFiles
          files={stagedFiles}
          onChange={onFilesChange}
          filePolicy={filePolicy.output}
          mode="output"
          title={agentId ? "صف آپلود خروجی (بعد از ذخیره)" : "فایل نمونه خروجی"}
        />
        <div className="border-t border-stone-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-stone-600">خط‌مشی خروجی</p>
          <FilePolicyForm
            value={filePolicy.output}
            onChange={(p: AgentFilePolicy) =>
              onFilePolicyChange({ ...filePolicy, output: p })
            }
            mode="output"
          />
        </div>
      </section>
    </div>
  );
}