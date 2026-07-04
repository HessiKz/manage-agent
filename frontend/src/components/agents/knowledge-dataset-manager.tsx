"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Database, Plus } from "lucide-react";
import {
  createKnowledgeDataset,
  fetchKnowledgeDatasets,
  ingestKnowledgeDataset,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { KnowledgeDataset } from "@/types";

const EMPTY_DATASET = {
  name: "",
  slug: "",
  description: "",
  department: "",
};

type Props = {
  compact?: boolean;
};

export function KnowledgeDatasetManager({ compact = false }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_DATASET);
  const [ingestForms, setIngestForms] = useState<Record<string, string>>({});
  const [showAddForm, setShowAddForm] = useState(!compact);

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["knowledge-datasets"],
    queryFn: () => fetchKnowledgeDatasets(),
  });

  const createDs = useMutation({
    mutationFn: () => createKnowledgeDataset(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-datasets"] });
      setForm(EMPTY_DATASET);
      setShowAddForm(false);
    },
  });

  const ingest = useMutation({
    mutationFn: ({ datasetId, content }: { datasetId: string; content: string }) =>
      ingestKnowledgeDataset(datasetId, content),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge-datasets"] }),
  });

  return (
    <div className="space-y-4">
      {compact ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-stone-800">مدیریت مجموعه‌های دانش</p>
          <Button
            type="button"
            variant="secondary"
            className="!px-3 !py-1.5 text-xs"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            {showAddForm ? "بستن فرم" : "مجموعه جدید"}
          </Button>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-bold text-stone-900">مجموعه‌های دانش سازمانی</h2>
          <p className="text-sm text-stone-500">
            مجموعه‌های مشترک که چند ایجنت می‌توانند به آن‌ها دسترسی داشته باشند
          </p>
        </div>
      )}

      {(showAddForm || !compact) && (
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Plus className="h-4 w-4 text-brand-600" />
              مجموعه جدید
            </h3>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Input
              data-ma-support="knowledge-dataset-name"
              placeholder="نام مجموعه"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              data-ma-support="knowledge-dataset-slug"
              placeholder="slug (اختیاری)"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            <Input
              placeholder="دپارتمان (اختیاری)"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
            <Textarea
              className="md:col-span-2"
              placeholder="توضیحات"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <Button
              data-ma-support="knowledge-dataset-save"
              onClick={() => createDs.mutate()}
              disabled={!form.name.trim() || createDs.isPending}
            >
              {createDs.isPending ? "در حال ذخیره…" : "افزودن مجموعه"}
            </Button>
          </CardBody>
        </Card>
      )}

      {isLoading && <p className="text-sm text-stone-400">بارگذاری…</p>}

      {datasets.map((ds) => (
        <DatasetCard
          key={ds.id}
          ds={ds}
          ingestContent={ingestForms[ds.id] ?? ""}
          onIngestContentChange={(v) => setIngestForms((f) => ({ ...f, [ds.id]: v }))}
          onIngest={() => {
            const content = (ingestForms[ds.id] ?? "").trim();
            if (content.length < 10) return;
            ingest.mutate(
              { datasetId: ds.id, content },
              {
                onSuccess: () =>
                  setIngestForms((f) => ({
                    ...f,
                    [ds.id]: "",
                  })),
              }
            );
          }}
          ingesting={ingest.isPending}
        />
      ))}
    </div>
  );
}

function DatasetCard({
  ds,
  ingestContent,
  onIngestContentChange,
  onIngest,
  ingesting,
}: {
  ds: KnowledgeDataset;
  ingestContent: string;
  onIngestContentChange: (v: string) => void;
  onIngest: () => void;
  ingesting: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold">{ds.name}</h3>
            <p className="text-xs text-stone-500">{ds.slug}</p>
          </div>
        </div>
        <Badge variant="muted">{ds.chunk_count} بخش</Badge>
      </CardHeader>
      <CardBody className="space-y-3">
        {ds.description ? <p className="text-sm text-stone-600">{ds.description}</p> : null}
        <Textarea
          data-ma-support="knowledge-dataset-ingest"
          rows={4}
          placeholder="متن دانش سازمانی را برای این مجموعه وارد کنید…"
          value={ingestContent}
          onChange={(e) => onIngestContentChange(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          className="!px-3 !py-1.5 text-xs"
          onClick={onIngest}
          disabled={ingestContent.trim().length < 10 || ingesting}
        >
          {ingesting ? "در حال درج…" : "درج در مجموعه"}
        </Button>
      </CardBody>
    </Card>
  );
}
