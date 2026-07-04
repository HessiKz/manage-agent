"use client";

import { useMemo, type ComponentPropsWithoutRef } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import {
  downloadFileWithAuth,
  isProtectedDownloadUrl,
  toFetchableDownloadUrl,
} from "@/lib/download-url";
import { normalizeChatMarkdown } from "@/lib/normalize-chat-markdown";
import { showErrorToast } from "@/lib/toast-errors";
import { cn } from "@/lib/utils";

type Variant = "user" | "assistant" | "document";

type Props = {
  content: string;
  variant: Variant;
  className?: string;
};

type Palette = {
  variant: Variant;
  text: string;
  muted: string;
  strong: string;
  link: string;
  hr: string;
  codeBg: string;
  codeText: string;
  preBg: string;
  preBorder: string;
  quoteBorder: string;
  quoteText: string;
  tableBorder: string;
  tableHead: string;
  headingBorder: string;
  listMarker: string;
};

const PALETTES: Record<Variant, Palette> = {
  user: {
    variant: "user",
    text: "text-stone-800",
    muted: "text-stone-600",
    strong: "font-bold text-stone-900",
    link: "font-semibold text-brand-700 underline decoration-brand-400/70 underline-offset-2 hover:text-brand-800",
    hr: "border-stone-300",
    codeBg: "bg-stone-200/80",
    codeText: "text-stone-900",
    preBg: "bg-stone-100",
    preBorder: "border-stone-200",
    quoteBorder: "border-brand-400",
    quoteText: "text-stone-600",
    tableBorder: "border-stone-200",
    tableHead: "bg-stone-100 text-stone-800",
    headingBorder: "border-stone-200",
    listMarker: "marker:text-brand-600",
  },
  document: {
    variant: "document",
    text: "text-stone-800",
    muted: "text-stone-600",
    strong: "font-bold text-stone-900",
    link: "font-semibold text-brand-700 underline decoration-brand-400/70 underline-offset-2 hover:text-brand-800",
    hr: "border-stone-200",
    codeBg: "bg-stone-100",
    codeText: "text-stone-900",
    preBg: "bg-stone-50",
    preBorder: "border-stone-200",
    quoteBorder: "border-brand-300",
    quoteText: "text-stone-600",
    tableBorder: "border-stone-200",
    tableHead: "bg-stone-100 text-stone-800",
    headingBorder: "border-stone-200",
    listMarker: "marker:text-brand-600",
  },
  assistant: {
    variant: "assistant",
    text: "text-white/95",
    muted: "text-white/85",
    strong: "font-bold text-white",
    link: "font-semibold text-white underline decoration-white/60 underline-offset-2 hover:text-white",
    hr: "border-white/40",
    codeBg: "bg-white/20",
    codeText: "text-white",
    preBg: "bg-black/25",
    preBorder: "border-white/15",
    quoteBorder: "border-white/50",
    quoteText: "text-white/90",
    tableBorder: "border-white/25",
    tableHead: "bg-white/15 text-white",
    headingBorder: "border-white/25",
    listMarker: "marker:text-white/80",
  },
};

function buildComponents(palette: Palette): Components {
  const block = "my-2.5 first:mt-0 last:mb-0";
  const isAssistant = palette.variant === "assistant";

  return {
    p: ({ children }) => (
      <p className={cn("text-sm leading-7", block, palette.text)}>{children}</p>
    ),
    h1: ({ children }) => (
      <h1
        className={cn(
          "text-lg font-bold leading-snug",
          block,
          palette.strong,
          isAssistant && "text-white drop-shadow-sm"
        )}
      >
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2
        className={cn(
          "border-b pb-1.5 text-base font-bold leading-snug",
          block,
          palette.strong,
          palette.headingBorder,
          isAssistant && "text-white"
        )}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3
        className={cn(
          "text-sm font-bold leading-snug",
          block,
          palette.strong,
          isAssistant ? "text-white/95" : "text-brand-800"
        )}
      >
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className={cn("text-sm font-semibold", block, palette.muted)}>{children}</h4>
    ),
    strong: ({ children }) => (
      <strong
        className={cn(
          palette.strong,
          isAssistant && "rounded bg-white/20 px-1 py-px"
        )}
      >
        {children}
      </strong>
    ),
    em: ({ children }) => <em className={cn("italic", palette.muted)}>{children}</em>,
    del: ({ children }) => (
      <del className={cn("line-through opacity-75", palette.muted)}>{children}</del>
    ),
    hr: () => (
      <hr className={cn("my-4 border-0 border-t-2", palette.hr)} aria-hidden />
    ),
    ul: ({ children }) => (
      <ul
        className={cn(
          "list-disc list-outside space-y-1.5 pr-5 text-sm leading-7",
          block,
          palette.text,
          palette.listMarker
        )}
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol
        className={cn(
          "list-decimal list-outside space-y-1.5 pr-5 text-sm leading-7",
          block,
          palette.text,
          palette.listMarker
        )}
      >
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="leading-7 [&>p]:my-0 [&>ul]:mt-1.5 [&>ol]:mt-1.5">{children}</li>
    ),
    blockquote: ({ children }) => (
      <blockquote
        className={cn(
          "rounded-lg border-r-4 bg-black/5 py-2 pr-3 pl-2 text-sm leading-7",
          block,
          palette.quoteBorder,
          palette.quoteText,
          isAssistant && "bg-white/10"
        )}
      >
        {children}
      </blockquote>
    ),
    a: ({ href, children }) => {
      if (href && isProtectedDownloadUrl(href)) {
        return (
          <button
            type="button"
            className={cn(
              palette.link,
              "inline cursor-pointer border-0 bg-transparent p-0 text-left font-inherit"
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void downloadFileWithAuth(toFetchableDownloadUrl(href)).catch((err) =>
                showErrorToast(err, "دانلود فایل")
              );
            }}
          >
            {children}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={palette.link}>
          {children}
        </a>
      );
    },
    code: ({ className, children, ...rest }) => {
      const isBlock = Boolean(className);
      if (isBlock) {
        return (
          <code
            className={cn(
              "block overflow-x-auto font-mono text-xs leading-relaxed",
              palette.codeText
            )}
            {...rest}
          >
            {children}
          </code>
        );
      }
      return (
        <code
          className={cn(
            "rounded px-1.5 py-0.5 font-mono text-[0.8125rem]",
            palette.codeBg,
            palette.codeText
          )}
          {...rest}
        >
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre
        className={cn(
          "overflow-x-auto rounded-lg border p-3 font-mono text-xs leading-relaxed",
          block,
          palette.preBg,
          palette.preBorder,
          palette.codeText
        )}
      >
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className={cn("overflow-x-auto rounded-lg border", block, palette.preBorder)}>
        <table className={cn("w-full min-w-[12rem] border-collapse text-sm", palette.text)}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead>{children}</thead>,
    tbody: ({ children }) => <tbody>{children}</tbody>,
    tr: ({ children }) => <tr className={cn("border-b", palette.tableBorder)}>{children}</tr>,
    th: ({ children }) => (
      <th
        className={cn(
          "px-3 py-2 text-right text-xs font-bold",
          palette.tableHead
        )}
      >
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className={cn("px-3 py-2 align-top text-xs leading-relaxed", palette.text)}>
        {children}
      </td>
    ),
    input: (props: ComponentPropsWithoutRef<"input">) => (
      <input {...props} disabled className="me-2 align-middle accent-brand-500" />
    ),
  };
}

export function ChatMarkdown({ content, variant, className }: Props) {
  const normalized = useMemo(() => normalizeChatMarkdown(content), [content]);
  const components = useMemo(() => buildComponents(PALETTES[variant]), [variant]);

  if (!normalized.trim()) return null;

  return (
    <div dir="auto" className={cn("chat-markdown min-w-0 max-w-full break-words", className)}>
      <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components}>
        {normalized}
      </Markdown>
    </div>
  );
}
