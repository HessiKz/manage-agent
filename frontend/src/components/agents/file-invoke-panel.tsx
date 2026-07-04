"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { invokeAgent } from "@/lib/api";
import { handleApiError } from "@/lib/api-error-handler";
import type { Agent, AgentFilePolicy } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

function defaultFileInvokePrompt(agent: Agent): string {
  const desc = (agent.description || "").trim();
  if (desc) {
    return `${desc} — فایل‌های آپلودشده را پردازش کن و نتیجه کامل را گزارش بده.`;
  }
  return "فایل‌های آپلودشده را پردازش کن و نتیجه کامل را گزارش بده.";
}

type Props = {
  agent: Agent;
  filePolicy: AgentFilePolicy;
  fileCount: number;
  onRunStart?: (userLine: string) => void;
  onChatExchange?: (user: string, assistant: string) => void;
};

export function FileInvokePanel({
  agent,
  filePolicy,
  fileCount,
  onRunStart,
  onChatExchange,
}: Props) {
  const [prompt, setPrompt] = useState(() => defaultFileInvokePrompt(agent));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minFiles = Math.max(1, filePolicy.min_files ?? 1);
  const filesReady = fileCount >= minFiles;
  const disabledReason = !filesReady
    ? fileCount === 0
      ? "ابتدا فایل را آپلود کنید"
      : `حداقل ${minFiles} فایل برای اجرا لازم است (${fileCount} فعلی)`
    : null;

  async function run() {
    const text = prompt.trim() || defaultFileInvokePrompt(agent);
    setLoading(true);
    setError(null);
    const userLine = `اجرای فایل: ${text}`;
    onRunStart?.(userLine);
    try {
      const res = await invokeAgent(agent.id, text);
      const output = res.output ?? "";
      onChatExchange?.(userLine, output);
    } catch (e: unknown) {
      const apiErr = handleApiError(e, {
        event: "file.invoke",
        toast: true,
        toastTitle: "خطا در اجرای ایجنت",
      });
      setError(apiErr.message);
      onChatExchange?.(userLine, `خطا در اجرا: ${apiErr.message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 shrink-0 border-t border-stone-100 pt-4">
      <label htmlFor="file-invoke-prompt" className="mb-1.5 block text-xs font-semibold text-stone-600">
        دستور اجرا
      </label>
      <Input
        id="file-invoke-prompt"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="mb-3"
        disabled={loading}
      />
      {disabledReason && <p className="mb-2 text-xs text-stone-500">{disabledReason}</p>}
      {error && <p className="mb-2 text-sm text-accent-red">{error}</p>}
      <Button className="w-full" onClick={() => void run()} disabled={loading || !filesReady}>
        {loading ? <LoadingSpinner /> : <Play className="h-4 w-4" />}
        اجرا
      </Button>
    </div>
  );
}