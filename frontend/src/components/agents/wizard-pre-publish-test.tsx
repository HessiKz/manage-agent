"use client";

import { useRef, useState } from "react";
import { Paperclip, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { previewInvokeAgent } from "@/lib/api";
import { formatAssistantOutput } from "@/lib/sanitize-chat-message";
import { handleApiError } from "@/lib/api-error-handler";
import { appAlert } from "@/lib/app-dialog";
import { extractRuntimeFileContext } from "@/lib/instruction-file-text";
import type { AgentPreviewInvokePayload } from "@/lib/api";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type Props = {
  buildPayload: (input: string) => AgentPreviewInvokePayload;
  resolveInlineFileContext?: () => Promise<string | undefined>;
  fileUploadEnabled?: boolean;
  onTestSuccess?: () => void;
};

export function WizardPrePublishTest({
  buildPayload,
  resolveInlineFileContext,
  fileUploadEnabled = false,
  onTestSuccess,
}: Props) {
  const [input, setInput] = useState("");
  const [testFiles, setTestFiles] = useState<File[]>([]);
  const [output, setOutput] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [testedOk, setTestedOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function runTest() {
    if (!input.trim() && testFiles.length === 0) {
      await appAlert({
        title: "ورودی تست",
        message: "یک پیام بنویسید یا فایل برای تست انتخاب کنید.",
      });
      return;
    }
    setRunning(true);
    setOutput(null);
    try {
      const stagedCtx = resolveInlineFileContext ? await resolveInlineFileContext() : undefined;
      const testCtx = await extractRuntimeFileContext(testFiles);
      const inline = [stagedCtx, testCtx].filter(Boolean).join("\n\n") || undefined;
      const base = buildPayload(input.trim() || "تست فایل");
      const res = await previewInvokeAgent({
        ...base,
        inline_file_context: inline ?? base.inline_file_context,
      });
      const text = formatAssistantOutput(res.output);
      setOutput(text);
      setTestedOk(true);
      onTestSuccess?.();
    } catch (e) {
      const err = handleApiError(e, { event: "agent.wizard.preview" });
      setOutput(`خطا: ${err.message}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-brand-200 bg-white p-4 shadow-sm">
      <div>
        <p className="font-semibold text-stone-900">اجرای تست</p>
        <p className="mt-1 text-xs text-stone-500">
          ورودی می‌تواند متن یا فایل باشد — هر دو در پیش‌نمایش لحاظ می‌شوند.
          {fileUploadEnabled ? " فایل‌های مرحله ورودی/خروجی هم ارسال می‌شوند." : ""}
        </p>
      </div>
      <Textarea
        data-ma-support="wizard-preview-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        rows={3}
        placeholder="مثلاً: خلاصه‌ای از وضعیت مالی بده…"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const list = e.target.files;
            if (list?.length) setTestFiles((prev) => [...prev, ...Array.from(list)]);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
          <Paperclip className="h-4 w-4" />
          پیوست فایل
        </Button>
        {testFiles.map((f, i) => (
          <span
            key={`${f.name}-${i}`}
            className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-1 text-xs"
          >
            {f.name}
            <button type="button" onClick={() => setTestFiles((p) => p.filter((_, j) => j !== i))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Button
        type="button"
        data-ma-support="wizard-preview-run"
        onClick={() => void runTest()}
        disabled={running}
      >
        {running ? <LoadingSpinner /> : <Play className="h-4 w-4" />}
        اجرای تست
      </Button>
      {output !== null && (
        <div className="rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-sm leading-relaxed text-stone-800 whitespace-pre-wrap">
          {output}
        </div>
      )}
      {testedOk && (
        <p className="text-xs font-medium text-emerald-700">تست با موفقیت انجام شد — می‌توانید منتشر کنید.</p>
      )}
    </div>
  );
}

export function useWizardTestGate() {
  const [skipTest, setSkipTest] = useState(false);
  const [testedOk, setTestedOk] = useState(false);
  const canPublish = testedOk || skipTest;
  return { skipTest, setSkipTest, testedOk, setTestedOk, canPublish };
}