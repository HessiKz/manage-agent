"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Link2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSpinner } from "@/components/loading";
import { ClientDateTime } from "@/components/ui/client-date";
import { useAuthStore } from "@/stores/auth-store";
import { appAlert } from "@/lib/app-dialog";
import {
  fetchSkills,
  fetchTopFailures,
  linkFailureToSkill,
  type FailureRead,
  type SkillRead,
} from "@/lib/skill-client";

function recommendedFixText(f: FailureRead): string | null {
  const fix = f.recommended_fix as
    | { message_fa?: string | null }
    | Record<string, unknown>
    | undefined;
  if (!fix) return null;
  if (typeof fix.message_fa === "string" && fix.message_fa) return fix.message_fa;
  return null;
}

export default function AdminFailuresPage() {
  const isSuperuser = useAuthStore((s) => s.user?.is_superuser);
  const qc = useQueryClient();
  const [selected, setSelected] = useState<FailureRead | null>(null);
  const [linkSkillId, setLinkSkillId] = useState<string>("");

  const { data: failures = [], isLoading } = useQuery({
    queryKey: ["admin-failures"],
    queryFn: () => fetchTopFailures(20),
    enabled: !!isSuperuser,
  });

  const { data: skills = [] } = useQuery({
    queryKey: ["admin-skills-all"],
    queryFn: () => fetchSkills(),
    enabled: !!isSuperuser,
  });

  const linkMut = useMutation({
    mutationFn: (vars: { patternHash: string; skillId: string }) =>
      linkFailureToSkill(vars.patternHash, vars.skillId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-failures"] });
      setLinkSkillId("");
      appAlert({ title: "انجام شد", message: "مهارت به الگوی خطا متصل شد." });
    },
    onError: () =>
      appAlert({
        title: "خطا",
        message: "اتصال مهارت به الگوی خطا ممکن نشد.",
        tone: "danger",
      }),
  });

  const skillsById = useMemo(() => {
    const m = new Map<string, SkillRead>();
    for (const s of skills) m.set(s.id, s);
    return m;
  }, [skills]);

  if (!isSuperuser) {
    return (
      <div className="page-padding text-sm text-stone-500">
        این بخش فقط برای ادمین‌ها قابل دسترسی است.
      </div>
    );
  }

  return (
    <div className="page-padding space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">دفترچه خطاها</h1>
        <p className="text-sm text-stone-500 sm:text-base">
          الگوهای تکرارشونده شکست و ریشه‌یابی
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h3 className="font-bold">الگوهای برتر شکست</h3>
            <p className="mt-0.5 text-xs text-stone-500">{failures.length} الگو</p>
          </CardHeader>
          <CardBody className="space-y-2">
            {isLoading && (
              <div className="flex items-center justify-center py-10">
                <LoadingSpinner tone="neutral" />
              </div>
            )}
            {!isLoading && failures.length === 0 && (
              <EmptyState
                icon={AlertTriangle}
                title="الگوی شکستی ثبت نشده"
                description="هنوز هیچ خطای تکرارشونده‌ای ثبت نشده است."
              />
            )}
            {failures.map((f) => {
              const active = selected?.pattern_hash === f.pattern_hash;
              return (
                <button
                  key={f.pattern_hash}
                  type="button"
                  onClick={() => {
                    setSelected(f);
                    setLinkSkillId(f.resolved_by_skill_id ?? "");
                  }}
                  className={
                    "block w-full rounded-xl border px-4 py-3 text-right transition " +
                    (active
                      ? "border-brand-300 bg-brand-50"
                      : "border-stone-100 bg-stone-50/60 hover:border-brand-200")
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="risk">{f.root_cause_tag}</Badge>
                      {f.phase && <Badge variant="muted">{f.phase}</Badge>}
                      {f.tool_name && (
                        <Badge variant="muted" dir="ltr">
                          {f.tool_name}
                        </Badge>
                      )}
                      {f.pathname_prefix && (
                        <Badge variant="muted" dir="ltr">
                          {f.pathname_prefix}
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm font-bold text-accent-red">
                      {f.occurrence_count}×
                    </span>
                  </div>
                  {f.sample_redacted && (
                    <p dir="ltr" className="mt-1 truncate text-xs text-stone-500">
                      {f.sample_redacted}
                    </p>
                  )}
                </button>
              );
            })}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="font-bold">جزئیات الگو</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            {!selected && (
              <p className="py-8 text-center text-sm text-stone-400">
                یک الگو را انتخاب کنید.
              </p>
            )}
            {selected && (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="risk">{selected.root_cause_tag}</Badge>
                  {selected.phase && <Badge variant="muted">{selected.phase}</Badge>}
                  {selected.tool_name && (
                    <Badge variant="muted" dir="ltr">
                      {selected.tool_name}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-stone-600">
                  <p>
                    <span className="text-stone-500">تعداد تکرار:</span>{" "}
                    <span className="font-bold text-accent-red">
                      {selected.occurrence_count}
                    </span>
                  </p>
                  <p>
                    <span className="text-stone-500">آخرین مشاهده:</span>{" "}
                    <ClientDateTime iso={selected.last_seen_at} />
                  </p>
                  {selected.pathname_prefix && (
                    <p dir="ltr" className="truncate">
                      <span className="text-stone-500">مسیر:</span>{" "}
                      {selected.pathname_prefix}
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-3">
                  <p className="mb-1 text-xs font-semibold text-stone-500">
                    رفع پیشنهادی
                  </p>
                  <p className="text-sm text-stone-700">
                    {recommendedFixText(selected) ?? "—"}
                  </p>
                </div>

                {selected.sample_redacted && (
                  <div className="rounded-xl border border-stone-100 bg-stone-50/60 p-3">
                    <p className="mb-1 text-xs font-semibold text-stone-500">
                      نمونه (حذف‌شده)
                    </p>
                    <p dir="ltr" className="break-words text-xs text-stone-600">
                      {selected.sample_redacted}
                    </p>
                  </div>
                )}

                {selected.resolved_by_skill_id &&
                  skillsById.get(selected.resolved_by_skill_id) && (
                    <p className="text-xs text-accent-green">
                      حل‌شده توسط مهارت:{" "}
                      {skillsById.get(selected.resolved_by_skill_id)?.name}
                    </p>
                  )}

                <div className="space-y-2 border-t border-stone-100 pt-3">
                  <label className="block text-sm text-stone-600">
                    اتصال به مهارت
                    <select
                      className="focus-ring mt-1 w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm"
                      value={linkSkillId}
                      onChange={(e) => setLinkSkillId(e.target.value)}
                    >
                      <option value="">— انتخاب مهارت —</option>
                      {skills.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.slug})
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    className="w-full"
                    disabled={!linkSkillId || linkMut.isPending}
                    onClick={() =>
                      linkSkillId &&
                      linkMut.mutate({
                        patternHash: selected.pattern_hash,
                        skillId: linkSkillId,
                      })
                    }
                  >
                    {linkMut.isPending ? (
                      <LoadingSpinner />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    اتصال مهارت
                  </Button>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
