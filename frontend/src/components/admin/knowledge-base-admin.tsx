"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Database, Plug, Upload } from "lucide-react";
import {
  createKnowledgeDataset,
  fetchKnowledgeDatasets,
  ingestKnowledgeDataset,
  uploadKnowledgeDatasetFile,
} from "@/lib/api";
import { ExternalApiManager } from "@/components/agents/external-api-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { ClientDateTime } from "@/components/ui/client-date";
import { cn } from "@/lib/utils";

function AccordionSection({
  title,
  icon: Icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-fit self-start">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-right"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2 font-bold text-stone-900">
          <Icon className="h-4 w-4 text-brand-600" />
          {title}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} />
      </button>
      {open && <CardBody className="border-t border-stone-100 pt-4">{children}</CardBody>}
    </Card>
  );
}

export function KnowledgeBaseAdmin() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [openKnowledge, setOpenKnowledge] = useState(true);
  const [openApi, setOpenApi] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    ingest: "",
  });

  const { data: datasets = [], isLoading } = useQuery({
    queryKey: ["knowledge-datasets", q],
    queryFn: () => fetchKnowledgeDatasets({ q: q || undefined }),
  });

  const createDs = useMutation({
    mutationFn: async () => {
      const ds = await createKnowledgeDataset({
        name: form.name,
        description: form.description || undefined,
        source_type: "text",
      });
      const text = form.ingest.trim();
      if (text.length >= 10) {
        await ingestKnowledgeDataset(ds.id, text);
      }
      return ds;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-datasets"] });
      setForm({ name: "", description: "", ingest: "" });
      setOpenKnowledge(true);
    },
  });

  const createWithFile = useMutation({
    mutationFn: async (file: File) => {
      const name = form.name.trim() || file.name.replace(/\.[^.]+$/, "");
      const ds = await createKnowledgeDataset({
        name,
        description: form.description || undefined,
        source_type: "file",
      });
      await uploadKnowledgeDatasetFile(ds.id, file);
      return ds;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-datasets"] });
      setForm({ name: "", description: "", ingest: "" });
      setOpenKnowledge(true);
    },
  });

  const upload = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      uploadKnowledgeDatasetFile(id, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knowledge-datasets"] }),
  });

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <AccordionSection
        title="افزودن دانش"
        icon={Database}
        open={openKnowledge}
        onToggle={() => setOpenKnowledge((v) => !v)}
      >
        <div className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-stone-500">مجموعه دانش جدید</p>
            <Input
              placeholder="نام مجموعه"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              placeholder="توضیح کوتاه"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div>
              <p className="mb-1 text-xs font-semibold text-stone-600">آپلود فایل</p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) createWithFile.mutate(f);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={createWithFile.isPending}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="h-4 w-4" />
                انتخاب فایل
              </Button>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-stone-600">یا متن دانش</p>
              <Textarea
                rows={4}
                placeholder="متن را اینجا بچسبانید…"
                value={form.ingest}
                onChange={(e) => setForm({ ...form, ingest: e.target.value })}
              />
            </div>
            <Button
              type="button"
              disabled={!form.name.trim() || createDs.isPending}
              onClick={() => createDs.mutate()}
            >
              ایجاد مجموعه
            </Button>
          </div>

          <div className="border-t border-stone-100 pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-stone-500">مجموعه‌های موجود</p>
              <Input
                placeholder="جستجو…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="max-w-[12rem] text-sm"
              />
            </div>
            {isLoading ? (
              <p className="text-sm text-stone-500">در حال بارگذاری…</p>
            ) : datasets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-stone-300 py-6 text-center text-sm text-stone-500">
                هنوز مجموعه‌ای تعریف نشده.
              </p>
            ) : (
              <div className="space-y-2">
                {datasets.map((ds) => (
                  <div
                    key={ds.id}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50/60 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Database className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                        <p className="font-semibold text-stone-900">{ds.name}</p>
                        <Badge variant="default">{ds.source_type ?? "text"}</Badge>
                      </div>
                      {ds.description ? (
                        <p className="mt-0.5 text-xs text-stone-600">{ds.description}</p>
                      ) : null}
                      <p className="mt-0.5 text-xs text-stone-400">
                        {ds.chunk_count} بخش · <ClientDateTime iso={ds.created_at} />
                      </p>
                    </div>
                    <label className="cursor-pointer shrink-0">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium hover:bg-stone-50">
                        <Upload className="h-3.5 w-3.5" />
                        آپلود فایل
                      </span>
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) upload.mutate({ id: ds.id, file: f });
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AccordionSection>

      <AccordionSection
        title="افزودن API و ابزار"
        icon={Plug}
        open={openApi}
        onToggle={() => setOpenApi((v) => !v)}
      >
        <ExternalApiManager compact />
      </AccordionSection>
    </div>
  );
}
