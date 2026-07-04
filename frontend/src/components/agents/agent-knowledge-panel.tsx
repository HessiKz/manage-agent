"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { fetchKnowledge, searchKnowledge } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ClientDateTime } from "@/components/ui/client-date";
import {
  chunkMeta,
  cleanFilename,
  readableText,
  sourceLabel,
} from "@/components/agents/agent-knowledge-summary";
import { BoundKnowledgeDatasetsSummary } from "@/components/agents/knowledge-bindings-summary";
import { WizardKnowledgeStep } from "@/components/agents/wizard-knowledge-step";
import type { Agent } from "@/types";

type Props = {
  agent: Agent;
};

export function AgentKnowledgePanel({ agent }: Props) {
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");

  const knowledge = useQuery({
    queryKey: ["knowledge", agent.id, "panel"],
    queryFn: () => fetchKnowledge({ agentId: agent.id, limit: 500 }),
  });

  const search = useQuery({
    queryKey: ["knowledge-search", query, agent.id],
    queryFn: () => searchKnowledge(query, agent.id),
    enabled: query.trim().length >= 3,
  });

  const chunks = knowledge.data ?? [];

  return (
    <div className="space-y-6" data-ma-support="agent-knowledge-panel">
      <Card>
        <CardHeader>
          <h3 className="font-bold text-stone-900">مجموعه‌های دانش متصل</h3>
          <p className="mt-1 text-xs text-stone-500">
            دانش سازمانی که هنگام ساخت ایجنت به آن دسترسی داده شده است.
          </p>
        </CardHeader>
        <CardBody>
          <BoundKnowledgeDatasetsSummary agent={agent} />
        </CardBody>
      </Card>

      <WizardKnowledgeStep
        mode="live"
        agent={agent}
        content={content}
        onContentChange={setContent}
      />

      <Card>
        <CardHeader>
          <h3 className="flex items-center gap-2 font-bold">
            <Search className="h-4 w-4 text-brand-600" />
            جستجو در دانسته‌های «{agent.name}»
          </h3>
        </CardHeader>
        <CardBody className="space-y-4">
          <input
            data-ma-support="knowledge-search"
            className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            placeholder="حداقل ۳ حرف برای جستجو…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {search.isFetching && <p className="text-sm text-stone-400">در حال جستجو…</p>}
          <div className="space-y-2">
            {(search.data ?? []).map((hit) => (
              <div
                key={hit.id}
                className="rounded-xl border border-stone-100 bg-brand-50/30 p-3 text-sm"
              >
                <p className="text-xs text-brand-600">میزان ارتباط: {hit.score.toFixed(2)}</p>
                <p className="mt-1 line-clamp-5 whitespace-pre-wrap leading-7 text-stone-700">
                  {readableText(hit.content)}
                </p>
              </div>
            ))}
            {query.length >= 3 && !search.isFetching && (search.data?.length ?? 0) === 0 && (
              <p className="text-sm text-stone-400">نتیجه‌ای یافت نشد</p>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-bold text-stone-900">داده‌های قابل استفاده برای پاسخ‌گویی</h3>
          <p className="mt-1 text-xs text-stone-500">
            بخش‌هایی که از فایل‌ها و متن‌های ثبت‌شده برای این ایجنت آماده شده‌اند.
          </p>
        </CardHeader>
        <CardBody className="space-y-3">
          {knowledge.isFetching && (
            <p className="text-sm text-stone-400">در حال بارگذاری داده‌ها…</p>
          )}
          {!knowledge.isFetching && chunks.length === 0 && (
            <p className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center text-sm text-stone-400">
              هنوز داده‌ای برای این ایجنت ثبت نشده است.
            </p>
          )}
          {chunks.map((chunk) => {
            const metaLine = chunkMeta(chunk);
            const filename = cleanFilename(chunk.source);
            return (
              <article
                key={chunk.id}
                className="rounded-xl border border-stone-100 bg-white px-4 py-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={chunk.source.startsWith("file:") ? "success" : "default"}>
                      {sourceLabel(chunk.source)}
                    </Badge>
                    {metaLine && <Badge variant="warning">{metaLine}</Badge>}
                  </div>
                  <span className="text-xs text-stone-400">
                    <ClientDateTime iso={chunk.created_at} />
                  </span>
                </div>
                {filename && (
                  <p className="mb-2 truncate text-xs font-medium text-stone-500">
                    نام فایل: {filename}
                  </p>
                )}
                <div
                  className="max-h-72 overflow-y-auto rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-3 text-right text-sm leading-8 text-stone-800"
                  dir="auto"
                >
                  <p className="whitespace-pre-wrap">
                    {readableText(chunk.content || chunk.content_preview || "")}
                  </p>
                </div>
              </article>
            );
          })}
        </CardBody>
      </Card>
    </div>
  );
}
