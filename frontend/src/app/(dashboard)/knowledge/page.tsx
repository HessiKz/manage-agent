"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Database, Search } from "lucide-react";
import { ingestKnowledge, searchKnowledge } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

export default function KnowledgePage() {
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");

  const ingest = useMutation({
    mutationFn: () => ingestKnowledge(content),
    onSuccess: () => setContent(""),
  });

  const search = useQuery({
    queryKey: ["knowledge-search", query],
    queryFn: () => searchKnowledge(query),
    enabled: query.length >= 3,
  });

  return (
    <Stagger initial={false} className="space-y-6 p-6" delayChildren={0.03} staggerChildren={0.05}>
      <StaggerItem variant="slideUp">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">پایگاه دانش</h1>
          <p className="text-stone-500">
            ذخیره متن، جستجوی برداری، کش امبدینگ — برای RAG در ارکستراتور
          </p>
        </div>
      </StaggerItem>

      <Stagger delayChildren={0.05} staggerChildren={0.06} className="grid gap-6 lg:grid-cols-2">
        <StaggerItem variant="scaleIn">
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 font-bold">
              <Database className="h-4 w-4 text-brand-600" />
              درج دانش
            </h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Textarea
              rows={8}
              placeholder="متن سند یا دانش سازمانی را وارد کنید (حداقل ۱۰ کاراکتر)…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <Button
              onClick={() => ingest.mutate()}
              disabled={content.length < 10 || ingest.isPending}
            >
              {ingest.isPending ? "در حال ذخیره…" : "ذخیره و ایندکس"}
            </Button>
            {ingest.isSuccess && (
              <p className="text-sm text-accent-green">ذخیره شد — شناسه: {ingest.data?.id}</p>
            )}
          </CardBody>
        </Card>
        </StaggerItem>

        <StaggerItem variant="slideUp">
        <Card>
          <CardHeader>
            <h2 className="flex items-center gap-2 font-bold">
              <Search className="h-4 w-4 text-brand-600" />
              جستجوی معنایی
            </h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <input
              className="w-full rounded-xl border border-stone-200 px-4 py-2.5 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              placeholder="عبارت جستجو…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {search.isFetching && <p className="text-sm text-stone-400">جستجو…</p>}
            <div className="space-y-2">
              {(search.data ?? []).map((hit) => (
                <div
                  key={hit.id}
                  className="rounded-xl border border-stone-100 bg-brand-50/30 p-3 text-sm"
                >
                  <p className="text-xs text-brand-600">امتیاز: {hit.score.toFixed(3)}</p>
                  <p className="mt-1 text-stone-700 line-clamp-4">{hit.content}</p>
                </div>
              ))}
              {query.length >= 3 && !search.isFetching && (search.data?.length ?? 0) === 0 && (
                <p className="text-sm text-stone-400">نتیجه‌ای یافت نشد</p>
              )}
            </div>
          </CardBody>
        </Card>
        </StaggerItem>
      </Stagger>
    </Stagger>
  );
}
