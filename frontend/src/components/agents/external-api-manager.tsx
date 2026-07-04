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

type Props = {
  compact?: boolean;
};

export function ExternalApiManager({ compact = false }: Props) {
  const qc = useQueryClient();
  const [serviceForm, setServiceForm] = useState(EMPTY_SERVICE);
  const [endpointForms, setEndpointForms] = useState<Record<string, typeof EMPTY_ENDPOINT>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(!compact);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["external-apis"],
    queryFn: fetchExternalApis,
  });

  const createSvc = useMutation({
    mutationFn: () => createExternalApiService(serviceForm),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["external-apis"] });
      setServiceForm(EMPTY_SERVICE);
      setShowAddForm(false);
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
    <div className="space-y-4">
      {compact ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-stone-800">مدیریت سرویس‌های API</p>
          <Button
            type="button"
            variant="secondary"
            className="!px-3 !py-1.5 text-xs"
            onClick={() => setShowAddForm((v) => !v)}
          >
            <Plus className="h-3.5 w-3.5" />
            {showAddForm ? "بستن فرم" : "سرویس جدید"}
          </Button>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-bold text-stone-900">سرویس‌های API خارجی</h2>
          <p className="text-sm text-stone-500">
            تعریف سرویس‌ها و اندپوینت‌ها — هر اندپوینت می‌تواند به‌عنوان ابزار ایجنت ثبت شود
          </p>
        </div>
      )}

      {(showAddForm || !compact) && (
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-sm font-bold">
              <Plus className="h-4 w-4 text-brand-600" />
              سرویس جدید
            </h3>
          </CardHeader>
          <CardBody className="grid gap-4 md:grid-cols-2">
            <Input
              data-ma-support="integration-service-name"
              placeholder="نام سرویس"
              value={serviceForm.name}
              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
            />
            <Input
              data-ma-support="integration-service-slug"
              placeholder="slug (اختیاری)"
              value={serviceForm.slug}
              onChange={(e) => setServiceForm({ ...serviceForm, slug: e.target.value })}
            />
            <Input
              data-ma-support="integration-base-url"
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
              data-ma-support="integration-save-service"
              onClick={() => createSvc.mutate()}
              disabled={!serviceForm.name || !serviceForm.base_url || createSvc.isPending}
            >
              {createSvc.isPending ? "در حال ذخیره…" : "افزودن سرویس"}
            </Button>
          </CardBody>
        </Card>
      )}

      {isLoading && <p className="text-sm text-stone-400">بارگذاری…</p>}

      {services.map((svc: ExternalApiService) => (
        <ServiceCard
          key={svc.id}
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
      ))}

      {testResult && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-bold">نتیجه تست</h3>
          </CardHeader>
          <CardBody>
            <pre className="max-h-48 overflow-auto rounded-lg bg-sidebar p-4 text-xs text-brand-100">
              {testResult}
            </pre>
          </CardBody>
        </Card>
      )}
    </div>
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
                <Button
                  data-ma-support="integration-test-endpoint"
                  variant="secondary"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={() => onTest(ep.id)}
                >
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
            data-ma-support="integration-endpoint-name"
            placeholder="نام اندپوینت"
            value={epForm.name}
            onChange={(e) => onEpChange({ name: e.target.value })}
          />
          <Input
            data-ma-support="integration-endpoint-path"
            placeholder="/path"
            value={epForm.path}
            onChange={(e) => onEpChange({ path: e.target.value })}
          />
          <select
            data-ma-support="integration-endpoint-method"
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
          <Button
            data-ma-support="integration-save-endpoint"
            onClick={onAddEndpoint}
            disabled={!epForm.name || adding}
          >
            افزودن اندپوینت
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
