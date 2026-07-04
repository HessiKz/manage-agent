"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Paperclip } from "lucide-react";
import {
  fetchAgentFiles,
  fetchKnowledge,
  fetchKnowledgeDatasets,
  ingestKnowledge,
  reindexAgentKnowledge,
  uploadAgentFile,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AgentKnowledgeSummary } from "@/components/agents/agent-knowledge-summary";
import { KnowledgeDatasetManager } from "@/components/agents/knowledge-dataset-manager";
import { KnowledgeDatasetPicker } from "@/components/agents/knowledge-dataset-picker";
import { BoundKnowledgeDatasetsSummary } from "@/components/agents/knowledge-bindings-summary";
import { parseKnowledgeBindings } from "@/lib/agent-knowledge-bindings";
import type { Agent, AgentKnowledgeBindings } from "@/types";

type StagedProps = {
  mode: "staged";
  bindings: AgentKnowledgeBindings;
  onBindingsChange: (next: AgentKnowledgeBindings) => void;
};

type LiveProps = {
  mode: "live";
  agent: Agent;
  content: string;
  onContentChange: (value: string) => void;
};

type Props = StagedProps | LiveProps;

export function WizardKnowledgeStep(props: Props) {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const agentId = props.mode === "live" ? props.agent.id : null;
  const bindings =
    props.mode === "live"
      ? parseKnowledgeBindings(props.agent.config_json)
      : props.bindings;

  const datasets = useQuery({
    queryKey: ["knowledge-datasets"],
    queryFn: () => fetchKnowledgeDatasets(),
  });

  const knowledge = useQuery({
    queryKey: ["knowledge", agentId ?? "staged"],
    queryFn: () => fetchKnowledge({ agentId: agentId!, limit: 100 }),
    enabled: props.mode === "live" && Boolean(agentId),
  });

  const agentFiles = useQuery({
    queryKey: ["agent-files", agentId, "wizard-knowledge"],
    queryFn: () => fetchAgentFiles(agentId!),
    enabled: props.mode === "live" && Boolean(agentId),
  });

  const ingest = useMutation({
    mutationFn: () => {
      if (props.mode !== "live") throw new Error("ایجنت هنوز ساخته نشده");
      return ingestKnowledge(props.content, props.agent.id);
    },
    onSuccess: async () => {
      if (props.mode === "live") props.onContentChange("");
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      if (props.mode !== "live") throw new Error("ایجنت هنوز ساخته نشده");
      return uploadAgentFile(props.agent.id, file);
    },
    onSuccess: async () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
      await qc.invalidateQueries({ queryKey: ["agent-files"] });
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  const reindex = useMutation({
    mutationFn: () => {
      if (props.mode !== "live") throw new Error("ایجنت هنوز ساخته نشده");
      return reindexAgentKnowledge(props.agent.id);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["knowledge"] });
    },
  });

  const boundDatasets = (datasets.data ?? []).filter((ds) =>
    bindings.dataset_ids.includes(ds.id)
  );
  const chunkCount =
    props.mode === "live"
      ? (knowledge.data?.length ?? 0)
      : boundDatasets.reduce((sum, ds) => sum + ds.chunk_count, 0);
  const fileCount = props.mode === "live" ? (agentFiles.data?.length ?? 0) : 0;

  return (
    <div className="space-y-5">
      {props.mode === "live" && <AgentKnowledgeSummary agent={props.agent} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-100 bg-stone-50/70 px-4 py-3">
          <p className="text-xs text-stone-500">مجموعه‌های متصل</p>
          <p className="text-xl font-bold text-stone-900">{bindings.dataset_ids.length}</p>
        </div>
        <div className="rounded-xl border border-stone-100 bg-stone-50/70 px-4 py-3">
          <p className="text-xs text-stone-500">بخش‌های دانش در دسترس</p>
          <p className="text-xl font-bold text-stone-900">{chunkCount}</p>
        </div>
      </div>

      <div className="space-y-6">
        <p className="text-sm leading-relaxed text-stone-600">
          مجموعه‌های دانش سازمانی را اینجا تعریف و پر کنید، سپس مشخص کنید این ایجنت به کدام
          مجموعه‌ها دسترسی دارد. هنگام پاسخ‌گویی، جستجو در دانش اختصاصی ایجنت و مجموعه‌های
          انتخاب‌شده انجام می‌شود.
        </p>
        <KnowledgeDatasetManager compact />
        <div className="space-y-3 border-t border-stone-100 pt-6">
          <p className="text-sm font-semibold text-stone-800">دسترسی این ایجنت به مجموعه‌ها</p>
          {props.mode === "staged" ? (
            <KnowledgeDatasetPicker value={props.bindings} onChange={props.onBindingsChange} />
          ) : (
            <BoundKnowledgeDatasetsSummary agent={props.agent} />
          )}
        </div>
      </div>

      {props.mode === "live" && (
        <details className="rounded-2xl border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-stone-800">
            دانش اختصاصی این ایجنت (اختیاری)
          </summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-brand-600" />
                <p className="text-sm font-bold text-stone-900">درج متن اختصاصی</p>
              </div>
              <Textarea
                rows={5}
                data-ma-support="knowledge-ingest"
                placeholder="متن اختصاصی فقط برای این ایجنت…"
                value={props.content}
                onChange={(e) => props.onContentChange(e.target.value)}
              />
              <Button
                data-ma-support="knowledge-save"
                onClick={() => ingest.mutate()}
                disabled={props.content.trim().length < 10 || ingest.isPending}
              >
                {ingest.isPending ? "در حال ذخیره…" : "ذخیره در دانش ایجنت"}
              </Button>
            </div>

            <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-800">
                <Paperclip className="h-4 w-4 text-brand-600" />
                فایل اختصاصی ({fileCount})
              </div>
              <input
                ref={fileInputRef}
                type="file"
                data-ma-support="knowledge-file-attach"
                accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx"
                disabled={uploadFile.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadFile.mutate(file);
                }}
                className="block w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 file:ml-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-brand-700"
              />
              {uploadFile.isPending && (
                <p className="mt-2 text-xs text-stone-500">در حال آپلود و ایندکس…</p>
              )}
              <div className="mt-4 border-t border-stone-100 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  data-ma-support="agent-knowledge-reindex"
                  onClick={() => reindex.mutate()}
                  disabled={reindex.isPending}
                >
                  {reindex.isPending ? "در حال بازسازی…" : "بازسازی دانش از فایل‌ها"}
                </Button>
              </div>
            </div>
          </div>
        </details>
      )}

      {boundDatasets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {boundDatasets.map((ds) => (
            <Badge key={ds.id} variant="default">
              {ds.name} · {ds.chunk_count} بخش
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
