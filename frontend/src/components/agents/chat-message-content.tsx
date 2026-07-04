"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Download } from "lucide-react";
import { ChatMarkdown } from "@/components/agents/chat-markdown";
import { downloadFileWithAuth, extractDownloadUrls } from "@/lib/download-url";
import { sanitizeChatMessage } from "@/lib/sanitize-chat-message";
import { showErrorToast } from "@/lib/toast-errors";
import { easeOut, getItemVariant, itemTransition } from "@/components/motion/variants";

type Props = {
  content: string;
  variant: "user" | "assistant" | "document";
  isStreaming?: boolean;
};

function StreamingWords({ content }: { content: string }) {
  const reduced = useReducedMotion();
  const parts = useMemo(() => content.split(/(\s+)/), [content]);
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (reduced) {
      setVisibleCount(parts.length);
      return;
    }
    if (visibleCount >= parts.length) return;
    const timer = window.setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + 1, parts.length));
    }, 20);
    return () => window.clearTimeout(timer);
  }, [parts.length, visibleCount, reduced]);

  useEffect(() => {
    setVisibleCount((prev) => Math.min(prev, parts.length));
  }, [parts.length]);

  if (reduced) {
    return <ChatMarkdown content={content} variant="assistant" />;
  }

  return (
    <span className="inline">
      {parts.slice(0, visibleCount).map((word, i) => (
        <motion.span
          key={`${i}-${word.slice(0, 12)}`}
          variants={getItemVariant("fadeIn", false)}
          initial="initial"
          animate="animate"
          transition={itemTransition}
          className="inline"
        >
          {word}
        </motion.span>
      ))}
      <motion.span
        aria-hidden
        animate={{ opacity: [1, 0, 1] }}
        transition={{ duration: 0.8, repeat: Infinity, ease: easeOut }}
        className="inline text-white/90"
      >
        |
      </motion.span>
    </span>
  );
}

export function ChatMessageContent({ content, variant, isStreaming = false }: Props) {
  const displayContent =
    variant === "assistant" || variant === "document"
      ? sanitizeChatMessage(content, "assistant")
      : content;
  const downloads =
    variant === "assistant" || variant === "document"
      ? extractDownloadUrls(displayContent)
      : [];
  const showStreaming = (variant === "assistant" || variant === "document") && isStreaming;

  return (
    <div className="space-y-2">
      {showStreaming && displayContent.trim() ? (
        <div
          className={
            variant === "document"
              ? "text-sm leading-relaxed text-stone-800"
              : "text-sm leading-relaxed text-white"
          }
        >
          <StreamingWords content={displayContent} />
        </div>
      ) : (
        <ChatMarkdown content={displayContent} variant={variant} />
      )}
      {!isStreaming && downloads.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {downloads.map((url, i) => (
            <button
              key={`${i}-${url}`}
              type="button"
              onClick={() =>
                downloadFileWithAuth(url).catch((err) =>
                  showErrorToast(err, "دانلود فایل")
                )
              }
              className={
                variant === "document"
                  ? "inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition-colors hover:bg-brand-100"
                  : "inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-semibold text-brand-800 shadow-sm transition-colors hover:bg-white"
              }
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
