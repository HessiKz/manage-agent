"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/loading";
import { useFeatureFlag } from "@/lib/feature-flags";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface KillSwitchState { enabled: boolean }
interface SandboxUsage { concurrent_jobs: number; daily_jobs: number; kill_switch_active: boolean }
interface SuccessRate { rate: number }

export default function SandboxAdminPage() {
  const qc = useQueryClient();
  const sandboxEnabled = useFeatureFlag("sandbox_execution_enabled");

  const ks = useQuery<KillSwitchState>({
    queryKey: ["sandbox-kill-switch"],
    queryFn: async () => (await api.get("/sandbox/kill-switch")).data,
  });
  const usage = useQuery<SandboxUsage>({
    queryKey: ["sandbox-usage"],
    queryFn: async () => (await api.get("/sandbox/usage")).data,
    refetchInterval: 5000,
  });
  const rate = useQuery<SuccessRate>({
    queryKey: ["sandbox-success-rate"],
    queryFn: async () => (await api.get("/observability/sandbox-success-rate")).data,
  });

  const toggleMut = useMutation({
    mutationFn: (enabled: boolean) => api.post<KillSwitchState>("/sandbox/kill-switch", { enabled }),
    onSuccess: (d) => {
      qc.setQueryData(["sandbox-kill-switch"], d.data);
      toast.success(d.data.enabled ? "kill-switch فعال شد" : "kill-switch خاموش شد");
    },
    onError: () => toast.error("تغییر kill-switch ممکن نشد"),
  });

  if (!sandboxEnabled) {
    return (
      <div className="page-padding py-10 text-center text-sm text-stone-500">
        محیط جعبه‌ای (sandbox) در حال حاضر غیرفعال است. برای فعال‌سازی، پرچم
        <span dir="ltr" className="px-1 font-mono">sandbox_execution_enabled</span> را روشن کنید.
      </div>
    );
  }

  return (
    <div className="page-padding space-y-6">
      <h1 className="text-xl font-bold text-stone-900">پایش جعبه‌ای (sandbox)</h1>

      <Card>
        <CardHeader>
          <h3 className="font-bold">kill-switch اضطراری</h3>
        </CardHeader>
        <CardBody className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {ks.data?.enabled ? (
              <>
                <ToggleRight className="h-6 w-6 text-accent-red" />
                <Badge variant="danger" dir="ltr">stop</Badge>
                <span className="text-sm text-stone-600">تمام کارهای جدید sandbox رد می‌شوند.</span>
              </>
            ) : (
              <>
                <ToggleLeft className="h-6 w-6 text-stone-400" />
                <Badge variant="success" dir="ltr">running</Badge>
                <span className="text-sm text-stone-600">ثبت کارهای sandbox مجاز است.</span>
              </>
            )}
          </div>
          <Button
            variant={ks.data?.enabled ? "secondary" : "danger"}
            disabled={ks.isLoading || toggleMut.isPending}
            onClick={() => toggleMut.mutate(!ks.data?.enabled)}
          >
            {toggleMut.isPending ? <LoadingSpinner /> : null}
            {ks.data?.enabled ? "فعال‌سازی مجدد" : "توقف اضطراری"}
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="font-bold">مصرف لحظه‌ای</h3>
        </CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <p><span className="text-stone-500">کارهای هم‌زمان:</span> {usage.data?.concurrent_jobs ?? "—"}</p>
          <p><span className="text-stone-500">کارهای روزانه:</span> {usage.data?.daily_jobs ?? "—"}</p>
          <p><span className="text-stone-500">نرخ موفقیت:</span> {((rate.data?.rate ?? 0) * 100).toFixed(0)}%</p>
        </CardBody>
      </Card>
    </div>
  );
}
