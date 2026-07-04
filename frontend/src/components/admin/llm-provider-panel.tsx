"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Radio, Server, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import {
  fetchLlmProvider,
  fetchLlmProviderHealth,
  updateLlmProvider,
  type LlmProviderId,
} from "@/lib/api";
import { appAlert, appConfirm } from "@/lib/app-dialog";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type ProviderChoice = {
  id: LlmProviderId;
  title: string;
  description: string;
  icon: typeof Server;
};

const PROVIDERS: ProviderChoice[] = [
  {
    id: "gateway",
    title: "API قبلی (Gateway)",
    description:
      "همان درگاه OpenAI-compatible فعلی (OPENAI_BASE_URL / کلید env). مدل هر ایجنت از تنظیمات خودش استفاده می‌شود.",
    icon: Server,
  },
  {
    id: "cursor",
    title: "cursor-to-api",
    description:
      "پروکسی محلی روی پورت ۹۱۹۱ که درخواست‌ها را به Cursor Agent CLI می‌فرستد. سرویس را با python -m cursor_to_api.main اجرا کنید.",
    icon: Sparkles,
  },
];

export function LlmProviderPanel() {
  const qc = useQueryClient();
  const { data: provider, isLoading: loadingProvider } = useQuery({
    queryKey: ["llm-provider"],
    queryFn: fetchLlmProvider,
  });
  const { data: health, refetch: refetchHealth } = useQuery({
    queryKey: ["llm-provider-health"],
    queryFn: fetchLlmProviderHealth,
    refetchInterval: 15_000,
  });

  const [active, setActive] = useState<LlmProviderId>("gateway");
  const [cursorBase, setCursorBase] = useState("");
  const [cursorModel, setCursorModel] = useState("auto");
  const [cursorKey, setCursorKey] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!provider) return;
    setActive(provider.active);
    setCursorBase(provider.cursor.base_url);
    setCursorModel(provider.cursor.model);
    setCursorKey(provider.cursor.api_key);
  }, [provider]);

  const saveMutation = useMutation({
    mutationFn: updateLlmProvider,
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["llm-provider"] }),
        qc.invalidateQueries({ queryKey: ["llm-provider-health"] }),
      ]);
      await appAlert({
        title: "ذخیره شد",
        message: "ارائه‌دهنده مدل برای همه اجراهای بعدی به‌روز شد.",
      });
    },
    onError: async () => {
      await appAlert({
        title: "خطا",
        message: "ذخیره تنظیمات مدل ممکن نشد.",
        tone: "danger",
      });
    },
  });

  async function handleSave() {
    if (active === "cursor" && health && !health.cursor.reachable) {
      const ok = await appConfirm({
        title: "سرویس در دسترس نیست",
        message:
          "cursor-to-api پاسخ نمی‌دهد. می‌توانید ذخیره کنید و بعداً سرویس را بالا بیاورید، یا ابتدا آن را اجرا کنید.",
        confirmLabel: "ذخیره همین‌طور",
        cancelLabel: "انصراف",
      });
      if (!ok) return;
    }
    saveMutation.mutate({
      active,
      cursor_base_url: cursorBase || undefined,
      cursor_api_key: cursorKey || undefined,
      cursor_model: cursorModel || undefined,
    });
  }

  const busy = loadingProvider || saveMutation.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-900">ارائه‌دهنده مدل (API)</h3>
          <p className="mt-0.5 text-xs text-stone-500">
            انتخاب بین درگاه قبلی و پروکسی cursor-to-api — فقط ادمین
          </p>
        </div>
        {health && (
          <Badge variant={health.active === "cursor" ? "default" : "muted"}>
            فعال: {health.active === "cursor" ? "cursor-to-api" : "Gateway"}
          </Badge>
        )}
      </CardHeader>
      <CardBody>
        {busy && !provider ? (
          <div className="flex items-center justify-center gap-2 py-8 text-stone-500">
            <LoadingSpinner />
            در حال بارگذاری…
          </div>
        ) : (
          <Stagger className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {PROVIDERS.map((p) => {
                const Icon = p.icon;
                const selected = active === p.id;
                const status =
                  p.id === "gateway"
                    ? health?.gateway
                    : health?.cursor;
                const ok =
                  p.id === "gateway"
                    ? status && "configured" in status && status.configured
                    : status && "reachable" in status && status.reachable;

                return (
                  <StaggerItem key={p.id} variant="scaleIn">
                    <button
                      type="button"
                      onClick={() => setActive(p.id)}
                      className={
                        "w-full rounded-2xl border p-4 text-right transition duration-200 " +
                        (selected
                          ? "border-brand-400 bg-brand-50/50 ring-2 ring-brand-200"
                          : "border-stone-200 bg-white hover:border-brand-200 hover:bg-brand-50/20")
                      }
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Icon
                            className={
                              "h-5 w-5 " +
                              (selected ? "text-brand-700" : "text-stone-400")
                            }
                            aria-hidden
                          />
                          <span className="font-bold text-stone-900">{p.title}</span>
                        </div>
                        <Radio
                          className={
                            "h-4 w-4 shrink-0 " +
                            (selected ? "text-brand-600" : "text-stone-300")
                          }
                          aria-hidden
                        />
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-stone-600">
                        {p.description}
                      </p>
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        {ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-accent-green" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-accent-red" />
                        )}
                        <span className="text-stone-500">
                          {p.id === "gateway"
                            ? health?.gateway.configured
                              ? health.gateway.base_url
                              : "کلید API تنظیم نشده"
                            : health?.cursor.reachable
                              ? "در دسترس"
                              : health?.cursor.detail ?? "غیرفعال"}
                        </span>
                      </div>
                    </button>
                  </StaggerItem>
                );
              })}
            </div>

            {active === "cursor" && (
              <StaggerItem variant="slideUp" className="space-y-3 rounded-xl border border-stone-100 bg-stone-50/50 p-4">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  {showAdvanced ? "پنهان کردن تنظیمات پیشرفته" : "تنظیمات پیشرفته cursor-to-api"}
                </button>
                {showAdvanced && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="text-xs font-medium text-stone-600">
                        آدرس پایه (OpenAI-compatible)
                      </span>
                      <input
                        type="url"
                        dir="ltr"
                        value={cursorBase}
                        onChange={(e) => setCursorBase(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                        placeholder="http://127.0.0.1:9191/api/v1"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-stone-600">مدل</span>
                      <input
                        type="text"
                        dir="ltr"
                        value={cursorModel}
                        onChange={(e) => setCursorModel(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                        placeholder="auto"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-stone-600">
                        کلید API (اختیاری)
                      </span>
                      <input
                        type="password"
                        dir="ltr"
                        value={cursorKey}
                        onChange={(e) => setCursorKey(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                        autoComplete="off"
                      />
                    </label>
                  </div>
                )}
                <p className="text-xs text-stone-500">
                  اجرا:{" "}
                  <code dir="ltr" className="rounded bg-white px-1 py-0.5 text-[11px]">
                    cd cursor-to-api && python -m cursor_to_api.main
                  </code>
                </p>
              </StaggerItem>
            )}

            <StaggerItem variant="scaleIn" className="flex flex-wrap items-center gap-2 pt-1">
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <>
                    <LoadingSpinner />
                    در حال ذخیره…
                  </>
                ) : (
                  "ذخیره انتخاب"
                )}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => refetchHealth()}
              >
                بررسی اتصال
              </Button>
            </StaggerItem>
          </Stagger>
        )}
      </CardBody>
    </Card>
  );
}