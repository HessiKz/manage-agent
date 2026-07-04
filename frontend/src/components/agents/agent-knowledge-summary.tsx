"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, FileText, GraduationCap } from "lucide-react";
import {
  fetchAgentFiles,
  fetchKnowledge,
  reindexAgentKnowledge,
  type KnowledgeChunk,
} from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClientDateTime } from "@/components/ui/client-date";
import { cn } from "@/lib/utils";
import type { Agent, AgentFile } from "@/types";

function textValue(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
}

function readableText(text: string) {
  return text
    .replace(/\b[A-Fa-f0-9]{10,}\b/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/([.؟?!])\s+/g, "$1\n")
    .replace(/[-–—]{6,}/g, "\n")
    .trim();
}

function sourceLabel(source: string) {
  if (source.startsWith("file:")) return "فایل آموزشی";
  if (source === "manual") return "دانش دستی";
  return "دانش ثبت‌شده";
}

function cleanFilename(source: string) {
  if (!source.startsWith("file:")) return "";
  const [, filename] = source.split(":");
  return filename || "";
}

function chunkMeta(chunk: KnowledgeChunk) {
  const idx = Number(chunk.meta?.chunk_index ?? 0);
  const total = Number(chunk.meta?.chunk_total ?? 0);
  if (!idx || !total || total <= 1) return null;
  return `بخش ${idx} از ${total}`;
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} بایت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} کیلوبایت`;
  return `${(bytes / 1024 / 1024).toFixed(1)} مگابایت`;
}

function KnowledgeFileList({ files }: { files: AgentFile[] }) {
  if (!files.length) {
    return <p className="text-sm text-stone-400">فایلی برای این ایجنت ثبت نشده است.</p>;
  }
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">{file.filename}</p>
            <p className="text-xs text-stone-400">{fileSize(file.size_bytes)}</p>
          </div>
          <span className="shrink-0 text-xs text-stone-400">
            <ClientDateTime iso={file.created_at} />
          </span>
        </div>
      ))}
    </div>
  );
}

function KnowledgeDataList({
  chunks,
  compact,
}: {
  chunks: KnowledgeChunk[];
  compact?: boolean;
}) {
  if (!chunks.length) {
    return (
      <p className="rounded-xl border border-dashed border-stone-200 px-4 py-6 text-center text-sm text-stone-400">
        هنوز داده‌ای برای پاسخ‌گویی ثبت نشده است.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {chunks.slice(0, compact ? 4 : 500).map((chunk) => {
        const metaLine = chunkMeta(chunk);
        const filename = cleanFilename(chunk.source);
        return (
          <article key={chunk.id} className="rounded-xl border border-stone-100 bg-white px-4 py-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={chunk.source.startsWith("file:") ? "success" : "default"}>
                {sourceLabel(chunk.source)}
              </Badge>
              {metaLine && <Badge variant="warning">{metaLine}</Badge>}
              {filename && <span className="truncate text-xs text-stone-400">{filename}</span>}
            </div>
            <div
              className={cn(
                "overflow-y-auto rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-3 text-right text-sm leading-8 text-stone-800",
                compact ? "max-h-36" : "max-h-72"
              )}
              dir="auto"
            >
              <p className="whitespace-pre-wrap">
                {readableText(chunk.content || chunk.content_preview || "")}
              </p>
            </div>
          </article>
        );
      })}
      {compact && chunks.length > 4 && (
        <p className="text-center text-xs text-stone-400">
          {chunks.length - 4} بخش دیگر در پایگاه دانش قابل مشاهده است.
        </p>
      )}
    </div>
  );
}

export function AgentKnowledgeSummary({
  agent,
  className,
  compact = false,
  showData = true,
  title,
  subtitle,
}: {
  agent: Agent;
  className?: string;
  compact?: boolean;
  showData?: boolean;
  title?: string;
  subtitle?: string;
}) {
  const qc = useQueryClient();
  const filesQuery = useQuery({
    queryKey: ["agent-files", agent.id, "knowledge-summary"],
    queryFn: () => fetchAgentFiles(agent.id),
    enabled: Boolean(agent.id),
  });
  const knowledgeQuery = useQuery({
    queryKey: ["knowledge", agent.id, "summary"],
    queryFn: () => fetchKnowledge({ agentId: agent.id, limit: compact ? 20 : 500 }),
    enabled: Boolean(agent.id),
  });

  const trainingProfile =
    agent.config_json?.training_profile && typeof agent.config_json.training_profile === "object"
      ? (agent.config_json.training_profile as Record<string, unknown>)
      : {};
  const responsibilities = stringList(trainingProfile.responsibilities);
  const howToSteps = stringList(trainingProfile.how_to_steps);
  const outputFormat = textValue(trainingProfile.output_format_spec);
  const behaviorNotes = textValue(trainingProfile.behavior_notes);
  const exampleOutput = textValue(trainingProfile.example_output);
  const systemPrompt = textValue(agent.system_prompt);
  const description = textValue(agent.description);
  const files = filesQuery.data ?? [];
  const chunks = knowledgeQuery.data ?? [];
  const reindex = useMutation({
    mutationFn: () => reindexAgentKnowledge(agent.id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
      await qc.invalidateQueries({ queryKey: ["agent-files"] });
    },
  });

  return (
    <section
      data-ma-support="agent-knowledge-summary"
      className={cn("rounded-3xl border border-stone-200/80 bg-white/90 shadow-card", className)}
    >
      <div className="flex flex-col gap-3 border-b border-stone-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="font-bold text-stone-900">
            {title ?? `چیزهایی که «${agent.name}» یاد گرفته`}
          </h2>
          <p className="mt-1 text-xs leading-6 text-stone-500">
            {subtitle ?? "این بخش نشان می‌دهد ایجنت با چه نقش، فایل‌ها و قوانین پاسخ‌گویی کار می‌کند."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-1.5 lg:items-end">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-2 text-xs"
              data-ma-support="agent-knowledge-reindex"
              onClick={() => reindex.mutate()}
              disabled={reindex.isPending}
            >
              {reindex.isPending ? "در حال بازسازی…" : "بازسازی دانش"}
            </Button>
            <Link href={`/agents/${agent.slug}?tab=knowledge`}>
              <Button
                type="button"
                variant="ghost"
                className="px-3 py-2 text-xs"
                data-ma-support="agent-knowledge-open-page"
              >
                تب پایگاه دانش
              </Button>
            </Link>
          </div>
          {reindex.isSuccess && (
            <p className="text-xs text-accent-green">
              {reindex.data.indexed_chunks} بخش از فایل‌ها آماده شد.
            </p>
          )}
        </div>
      </div>
      <div className={cn("grid gap-4 p-5", compact ? "lg:grid-cols-2" : "xl:grid-cols-2")}>
        <section
          data-ma-support="agent-knowledge-role"
          className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
            <Bot className="h-4 w-4 text-brand-600" />
            نقش و وظیفه
          </h3>
          {description ? (
            <p className="whitespace-pre-wrap text-sm leading-7 text-stone-700">
              {readableText(description)}
            </p>
          ) : (
            <p className="text-sm text-stone-400">توضیحی برای این ایجنت ثبت نشده است.</p>
          )}
          {responsibilities.length > 0 && (
            <ul className="space-y-2 text-sm leading-7 text-stone-700">
              {responsibilities.map((item) => (
                <li key={item}>• {readableText(item)}</li>
              ))}
            </ul>
          )}
        </section>

        <section
          data-ma-support="agent-knowledge-rules"
          className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
            <GraduationCap className="h-4 w-4 text-brand-600" />
            قوانین پاسخ‌گویی
          </h3>
          {[outputFormat, behaviorNotes].filter(Boolean).length > 0 ? (
            <div className="space-y-3 text-sm leading-7 text-stone-700">
              {outputFormat && <p className="whitespace-pre-wrap">{readableText(outputFormat)}</p>}
              {behaviorNotes && <p className="whitespace-pre-wrap">{readableText(behaviorNotes)}</p>}
            </div>
          ) : (
            <p className="text-sm text-stone-400">هنوز آموزش تعاملی قابل نمایش ثبت نشده است.</p>
          )}
        </section>

        {howToSteps.length > 0 && (
          <section
            data-ma-support="agent-knowledge-howto"
            className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-4"
          >
            <h3 className="text-sm font-bold text-stone-900">روش استفاده از ایجنت</h3>
            <ol className="space-y-2 text-sm leading-7 text-stone-700">
              {howToSteps.map((item, idx) => (
                <li key={item}>{idx + 1}. {readableText(item)}</li>
              ))}
            </ol>
          </section>
        )}

        <section
          data-ma-support="agent-knowledge-files"
          className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-bold text-stone-900">
            <FileText className="h-4 w-4 text-brand-600" />
            فایل‌های داده‌شده
          </h3>
          {filesQuery.isFetching ? (
            <p className="text-sm text-stone-400">در حال بارگذاری فایل‌ها…</p>
          ) : (
            <KnowledgeFileList files={files} />
          )}
        </section>

        {exampleOutput && (
          <section
            data-ma-support="agent-knowledge-example"
            className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-4 xl:col-span-2"
          >
            <h3 className="text-sm font-bold text-stone-900">نمونه پاسخ تأییدشده</h3>
            <div className={cn("overflow-y-auto rounded-xl bg-white px-3 py-3 text-sm leading-8 text-stone-700", compact ? "max-h-40" : "max-h-56")}>
              <p className="whitespace-pre-wrap">{readableText(exampleOutput)}</p>
            </div>
          </section>
        )}

        {!compact && systemPrompt && (
          <section
            data-ma-support="agent-knowledge-prompt"
            className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-4 xl:col-span-2"
          >
            <h3 className="text-sm font-bold text-stone-900">دستور کاری ایجنت</h3>
            <div className="max-h-64 overflow-y-auto rounded-xl bg-white px-3 py-3 text-sm leading-8 text-stone-700">
              <p className="whitespace-pre-wrap">{readableText(systemPrompt)}</p>
            </div>
          </section>
        )}

        {showData && (
          <section
            data-ma-support="agent-knowledge-data"
            className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/60 p-4 xl:col-span-2"
          >
            <h3 className="text-sm font-bold text-stone-900">داده‌های قابل استفاده برای پاسخ‌گویی</h3>
            {knowledgeQuery.isFetching ? (
              <p className="text-sm text-stone-400">در حال بارگذاری داده‌ها…</p>
            ) : (
              <KnowledgeDataList chunks={chunks} compact={compact} />
            )}
          </section>
        )}
      </div>
    </section>
  );
}

export {
  cleanFilename,
  chunkMeta,
  fileSize,
  readableText,
  sourceLabel,
};
