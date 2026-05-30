"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, Play, Plus } from "lucide-react";
import {
  createExternalApiEndpoint,
  createExternalApiService,
  fetchExternalApis,
  testExternalApiEndpoint,
} from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ExternalApiService } from "@/types";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

const EMPTY_SERVICE = {
  name: "",
  slug: "",
  description: "",
  base_url: "https://",
  auth_type: "none",
  is_active: true,
};

const EMPTY_ENDPOINT = {
  name: "",
  path: "/",
  method: "GET",
  register_as_tool: true,
};

export default function IntegrationsPage() {
  const qc = useQueryClient();
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [endpointForms, setEndpointForms] = useState<Record<string, typeof EMPTY_ENDPOINT>>({});
  const [testResult, setTestResult] = useState<string | null>(null);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["external-apis"],
    queryFn: fetchExternalApis,
  });

  const createSvc = useMutation({
    mutationFn: () => createExternalApiService(serviceForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-apis"] });
      setServiceForm(EMPTY_SERVICE);
    },
  });

  const createEp = useMutation({
    mutationFn: ({ serviceId, payload }: { serviceId: string; payload: Record<string, unknown> }) =>
      createExternalApiEndpoint(serviceId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["external-apis"] }),
  });

  async function runTest(endpointId: string) {
    setTestResult("در حال تست…");
    try {
      const res = await testExternalApiEndpoint(endpointId);
      setTestResult(JSON.stringify(res, null, 2));
    } catch (e: unknown) {
      setTestResult(getErrorMessage(e));
    }
  }

  function endpointForm(serviceId: string) {
    return endpointForms[serviceId] ?? EMPTY_ENDPOINT;
  }

  function setEndpointForm(serviceId: string, patch: Partial<typeof EMPTY_ENDPOINT>) {
    setEndpointForms((f) => ({
      ...f,
      [serviceId]: { ...endpointForm(serviceId), ...patch },
    }));
  }

  return (
    <Stagger initial={false} className="space-y-6 p-6" delayChildren={0.03} staggerChildren={0.05}>
      <StaggerItem variant="slideUp">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">سرویس‌های API خارجی</h1>
          <p className="text-stone-500">
            تعریف دستی سرویس‌ها و اندپوینت‌ها — هر اندپوینت می‌تواند به‌عنوان ابزار ایجنت ثبت شود
          </p>
        </div>
      </StaggerItem>

      <StaggerItem variant="scaleIn">
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-bold">
            <Plus className="h-4 w-4 text-brand-600" />
            سرویس جدید
          </h2>
        </CardHeader>
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Input
            placeholder="نام سرویس"
            value={serviceForm.name}
            onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
          />
          <Input
            placeholder="slug (اختیاری)"
            value={serviceForm.slug}
            onChange={(e) => setServiceForm({ ...serviceForm, slug: e.target.value })}
          />
          <Input
            className="md:col-span-2"
            placeholder="Base URL"
            value={serviceForm.base_url}
            onChange={(e) => setServiceForm({ ...serviceForm, base_url: e.target.value })}
          />
          <Textarea
            className="md:col-span-2"
            placeholder="توضیحات"
            rows={2}
            value={serviceForm.description}
            onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })}
          />
          <select
            className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
            value={serviceForm.auth_type}
            onChange={(e) => setServiceForm({ ...serviceForm, auth_type: e.target.value })}
          >
            <option value="none">بدون احراز هویت</option>
            <option value="api_key">API Key</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
          </select>
          <Button
            onClick={() => createSvc.mutate()}
            disabled={!serviceForm.name || !serviceForm.base_url || createSvc.isPending}
          >
            {createSvc.isPending ? "در حال ذخیره…" : "افزودن سرویس"}
          </Button>
        </CardBody>
      </Card>
      </StaggerItem>

      {isLoading && (
        <StaggerItem variant="fadeIn">
          <p className="text-stone-400">بارگذاری…</p>
        </StaggerItem>
      )}

      <Stagger delayChildren={0.04} staggerChildren={0.05}>
      {services.map((svc: ExternalApiService) => (
        <StaggerItem key={svc.id} variant="slideUp">
        <ServiceCard
          svc={svc}
          epForm={endpointForm(svc.id)}
          onEpChange={(p) => setEndpointForm(svc.id, p)}
          onAddEndpoint={() =>
            createEp.mutate({
              serviceId: svc.id,
              payload: endpointForm(svc.id) as unknown as Record<string, unknown>,
            })
          }
          onTest={runTest}
          adding={createEp.isPending}
        />
        </StaggerItem>
      ))}
      </Stagger>

      {testResult && (
        <StaggerItem variant="fadeIn">
        <Card>
          <CardHeader>
            <h3 className="font-bold">نتیجه تست</h3>
          </CardHeader>
          <CardBody>
            <pre className="max-h-64 overflow-auto rounded-lg bg-sidebar p-4 text-xs text-brand-100">
              {testResult}
            </pre>
          </CardBody>
        </Card>
        </StaggerItem>
      )}
    </Stagger>
  );
}

function ServiceCard({
  svc,
  epForm,
  onEpChange,
  onAddEndpoint,
  onTest,
  adding,
}: {
  svc: ExternalApiService;
  epForm: typeof EMPTY_ENDPOINT;
  onEpChange: (p: Partial<typeof EMPTY_ENDPOINT>) => void;
  onAddEndpoint: () => void;
  onTest: (id: string) => void;
  adding: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-bold">{svc.name}</h3>
            <p className="text-xs text-stone-500">{svc.base_url}</p>
          </div>
        </div>
        <Badge variant={svc.is_active ? "success" : "muted"}>
          {svc.is_active ? "فعال" : "غیرفعال"}
        </Badge>
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="space-y-2">
          {svc.endpoints?.length ? (
            svc.endpoints.map((ep) => (
              <div
                key={ep.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-100 bg-stone-50/50 px-4 py-3"
              >
                <div>
                  <p className="font-medium">
                    <span className="rounded bg-brand-600 px-1.5 py-0.5 text-xs text-white">
                      {ep.method}
                    </span>{" "}
                    {ep.name}
                  </p>
                  <p className="text-xs text-stone-500">{ep.path}</p>
                </div>
                <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => onTest(ep.id)}>
                  <Play className="h-3 w-3" />
                  تست
                </Button>
              </div>
            ))
          ) : (
            <p className="text-sm text-stone-400">هنوز اندپوینتی تعریف نشده</p>
          )}
        </div>

        <div className="grid gap-2 border-t border-stone-100 pt-4 md:grid-cols-4">
          <Input
            placeholder="نام اندپوینت"
            value={epForm.name}
            onChange={(e) => onEpChange({ name: e.target.value })}
          />
          <Input
            placeholder="/path"
            value={epForm.path}
            onChange={(e) => onEpChange({ path: e.target.value })}
          />
          <select
            className="rounded-xl border border-stone-200 px-3 py-2 text-sm"
            value={epForm.method}
            onChange={(e) => onEpChange({ method: e.target.value })}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
          <Button onClick={onAddEndpoint} disabled={!epForm.name || adding}>
            افزودن اندپوینت
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
