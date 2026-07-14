"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSpinner } from "@/components/loading";
import { useAuthStore } from "@/stores/auth-store";
import { appAlert, appConfirm } from "@/lib/app-dialog";
import {
  activateSkill,
  createSkill,
  fetchSkills,
  updateSkill,
  type SkillRead,
  type SkillScope,
  type SkillStatus,
} from "@/lib/skill-client";

const STATUS_LABEL: Record<SkillStatus, string> = {
  draft: "پیش‌نویس",
  active: "فعال",
  archived: "بایگانی",
};

const SCOPE_LABEL: Record<SkillScope, string> = {
  platform: "پلتفرم",
  org: "سازمان",
  agent: "ایجنت",
};

type EditState = {
  slug: string;
  name: string;
  description: string;
  content_md: string;
  procedure: string;
} | null;

type NewForm = {
  name: string;
  slug: string;
  scope: SkillScope;
  content_md: string;
  procedure: string;
};

const EMPTY_NEW: NewForm = {
  name: "",
  slug: "",
  scope: "platform",
  content_md: "",
  procedure: "{}",
};

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

export default function AdminSkillsPage() {
  const isSuperuser = useAuthStore((s) => s.user?.is_superuser);
  const qc = useQueryClient();
  const [edit, setEdit] = useState<EditState>(null);
  const [newForm, setNewForm] = useState<NewForm>(EMPTY_NEW);
  const [showNew, setShowNew] = useState(false);

  const { data: skills = [], isLoading } = useQuery({
    queryKey: ["admin-skills"],
    queryFn: () => fetchSkills(),
    enabled: !!isSuperuser,
  });

  const activateMut = useMutation({
    mutationFn: (slug: string) => activateSkill(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-skills"] }),
    onError: () =>
      appAlert({ title: "خطا", message: "فعال‌سازی مهارت ممکن نشد.", tone: "danger" }),
  });

  const saveMut = useMutation({
    mutationFn: (payload: { slug: string; body: Partial<SkillRead> }) =>
      updateSkill(payload.slug, payload.body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-skills"] });
      setEdit(null);
    },
    onError: () =>
      appAlert({ title: "خطا", message: "ذخیره ویرایش مهارت ممکن نشد.", tone: "danger" }),
  });

  const createMut = useMutation({
    mutationFn: (payload: Partial<SkillRead>) => createSkill(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-skills"] });
      setNewForm(EMPTY_NEW);
      setShowNew(false);
    },
    onError: () =>
      appAlert({ title: "خطا", message: "ایجاد مهارت ممکن نشد.", tone: "danger" }),
  });

  function startEdit(s: SkillRead) {
    setEdit({
      slug: s.slug,
      name: s.name,
      description: s.description ?? "",
      content_md: s.content_md ?? "",
      procedure:
        typeof s.procedure === "string"
          ? s.procedure
          : JSON.stringify(s.procedure ?? {}, null, 2),
    });
  }

  async function saveEdit() {
    if (!edit) return;
    let procedure: unknown;
    try {
      procedure = JSON.parse(edit.procedure || "{}");
    } catch {
      await appAlert({
        title: "خطا",
        message: "رویه (procedure) یک JSON معتبر نیست.",
        tone: "danger",
      });
      return;
    }
    saveMut.mutate({
      slug: edit.slug,
      body: {
        name: edit.name,
        description: edit.description,
        content_md: edit.content_md,
        procedure,
      },
    });
  }

  async function createNew() {
    let procedure: unknown;
    try {
      procedure = JSON.parse(newForm.procedure || "{}");
    } catch {
      await appAlert({
        title: "خطا",
        message: "رویه (procedure) یک JSON معتبر نیست.",
        tone: "danger",
      });
      return;
    }
    if (!newForm.name.trim()) {
      await appAlert({ title: "خطا", message: "نام مهارت الزامی است.", tone: "danger" });
      return;
    }
    createMut.mutate({
      name: newForm.name,
      slug: newForm.slug || undefined,
      scope: newForm.scope,
      content_md: newForm.content_md,
      procedure,
      status: "draft",
    });
  }

  if (!isSuperuser) {
    return (
      <div className="page-padding text-sm text-stone-500">
        این بخش فقط برای ادمین‌ها قابل دستюб است.
      </div>
    );
  }

  return (
    <div className="page-padding space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">مهارت‌های پلتفرم</h1>
          <p className="text-sm text-stone-500 sm:text-base">
            مدیریت کتابخانه مهارت‌ها و افشای آن‌ها به دستیار
          </p>
        </div>
        <Button onClick={() => setShowNew((v) => !v)}>
          <Sparkles className="h-4 w-4" />
          مهارت جدید
        </Button>
      </div>

      {showNew && (
        <Card>
          <CardHeader>
            <h3 className="font-bold">ایجاد مهارت جدید</h3>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm text-stone-600">
                نام
                <Input
                  className="mt-1"
                  value={newForm.name}
                  onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                  placeholder="مثلاً: ثبت گزارش فروش"
                />
              </label>
              <label className="text-sm text-stone-600">
                شناسه (slug) — اختیاری
                <Input
                  className="mt-1"
                  dir="ltr"
                  value={newForm.slug}
                  onChange={(e) => setNewForm({ ...newForm, slug: e.target.value })}
                  placeholder="auto-generated"
                />
              </label>
            </div>
            <label className="block text-sm text-stone-600">
              دامنه (scope)
              <select
                className="focus-ring mt-1 w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm"
                value={newForm.scope}
                onChange={(e) =>
                  setNewForm({ ...newForm, scope: e.target.value as SkillScope })
                }
              >
                <option value="platform">پلتفرم</option>
                <option value="org">سازمان</option>
                <option value="agent">ایجنت</option>
              </select>
            </label>
            <label className="block text-sm text-stone-600">
              محتوای Markdown
              <Textarea
                className="mt-1 min-h-[80px] font-mono"
                value={newForm.content_md}
                onChange={(e) => setNewForm({ ...newForm, content_md: e.target.value })}
                placeholder="توضیح کوتاه درباره مهارت..."
              />
            </label>
            <label className="block text-sm text-stone-600">
              رویه (procedure) — JSON
              <Textarea
                dir="ltr"
                className="mt-1 min-h-[120px] font-mono text-xs"
                value={newForm.procedure}
                onChange={(e) => setNewForm({ ...newForm, procedure: e.target.value })}
              />
            </label>
            <div className="flex items-center gap-2">
              <Button onClick={createNew} disabled={createMut.isPending}>
                {createMut.isPending ? <LoadingSpinner /> : null}
                ذخیره مهارت
              </Button>
              <Button variant="secondary" onClick={() => setShowNew(false)}>
                انصراف
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-bold">همه مهارت‌ها</h3>
            <p className="mt-0.5 text-xs text-stone-500">{skills.length} مهارت</p>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-10">
              <LoadingSpinner tone="neutral" />
            </div>
          )}
          {!isLoading && skills.length === 0 && (
            <EmptyState
              icon={Sparkles}
              title="مهارتی ثبت نشده"
              description="برای افزودن نخستین مهارت از دکمه «مهارت جدید» استفاده کنید."
            />
          )}
          {skills.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-stone-100 bg-stone-50/60 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-stone-900">{s.name}</p>
                    <Badge variant={s.status === "active" ? "success" : "muted"}>
                      {STATUS_LABEL[s.status]}
                    </Badge>
                    <Badge variant="default">{SCOPE_LABEL[s.scope]}</Badge>
                    <Badge variant="muted" dir="ltr">
                      v{s.version}
                    </Badge>
                  </div>
                  <p dir="ltr" className="truncate text-xs text-stone-500">
                    {s.slug} · {shortId(s.id)}
                  </p>
                  {s.content_md && (
                    <p className="mt-1 line-clamp-2 max-w-2xl text-xs text-stone-600">
                      {s.content_md}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span dir="ltr" className="text-xs text-stone-500">
                    {s.stats.success_count}✓ / {s.stats.failure_count}✗
                  </span>
                  {s.status !== "active" && (
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      disabled={activateMut.isPending}
                      onClick={() =>
                        appConfirm({
                          title: "فعال‌سازی مهارت",
                          message: `مهارت «${s.name}» فعال شود؟`,
                          confirmLabel: "فعال‌سازی",
                        }).then((ok) => ok && activateMut.mutate(s.slug))
                      }
                    >
                      {activateMut.isPending && activateMut.variables === s.slug ? (
                        <LoadingSpinner />
                      ) : null}
                      فعال‌سازی
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    className="px-2 py-1 text-xs"
                    onClick={() => startEdit(s)}
                  >
                    ویرایش
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="flex items-center justify-between">
              <h3 className="font-bold">ویرایش مهارت · {edit.slug}</h3>
              <Button variant="ghost" onClick={() => setEdit(null)}>
                بستن
              </Button>
            </CardHeader>
            <CardBody className="space-y-3">
              <label className="block text-sm text-stone-600">
                نام
                <Input
                  className="mt-1"
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <label className="block text-sm text-stone-600">
                توضیح
                <Input
                  className="mt-1"
                  value={edit.description}
                  onChange={(e) => setEdit({ ...edit, description: e.target.value })}
                />
              </label>
              <label className="block text-sm text-stone-600">
                محتوای Markdown
                <Textarea
                  className="mt-1 min-h-[80px] font-mono"
                  value={edit.content_md}
                  onChange={(e) => setEdit({ ...edit, content_md: e.target.value })}
                />
              </label>
              <label className="block text-sm text-stone-600">
                رویه (procedure) — JSON
                <Textarea
                  dir="ltr"
                  className="mt-1 min-h-[140px] font-mono text-xs"
                  value={edit.procedure}
                  onChange={(e) => setEdit({ ...edit, procedure: e.target.value })}
                />
              </label>
              <div className="flex items-center gap-2">
                <Button onClick={saveEdit} disabled={saveMut.isPending}>
                  {saveMut.isPending ? <LoadingSpinner /> : null}
                  ذخیره
                </Button>
                <Button variant="secondary" onClick={() => setEdit(null)}>
                  انصراف
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
