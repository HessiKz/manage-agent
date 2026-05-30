"use client";

import { Download } from "lucide-react";
import { extractDownloadUrls } from "@/lib/download-url";
import { sanitizeChatMessage } from "@/lib/sanitize-chat-message";

type Props = {
  content: string;
  variant: "user" | "assistant";
};

async function downloadWithAuth(url: string) {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `دانلود ناموفق (${res.status})`);
  }
  const blob = await res.blob();
  const name = url.split("/").pop() || "report.pdf";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function ChatMessageContent({ content, variant }: Props) {
  const displayContent = sanitizeChatMessage(content, variant);
  const downloads =
    variant === "assistant" ? extractDownloadUrls(displayContent) : [];
  const textClass = variant === "user" ? "text-stone-800" : "text-white";

  return (
    <div className="space-y-2">
      <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${textClass}`}>
        {displayContent}
      </p>
      {downloads.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {downloads.map((url, i) => (
            <button
              key={`${i}-${url}`}
              type="button"
              onClick={() => downloadWithAuth(url).catch(() => window.open(url, "_blank"))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-brand-800 shadow-sm transition-colors hover:bg-white"
            >
              <Download className="h-3.5 w-3.5" />
              دانلود نتیجه
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
