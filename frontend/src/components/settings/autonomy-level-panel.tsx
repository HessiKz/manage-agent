"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sliders } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import {
  AUTONOMY_HELPERS,
  AUTONOMY_LABELS,
  coerceLevel,
  type AutonomyLevel,
} from "@/lib/autonomy-policy";
import { useFeatureFlag } from "@/lib/feature-flags";
import {
  fetchAutonomyDefault,
  fetchUserPreferences,
  updateUserPreferences,
} from "@/lib/api";
import { appAlert } from "@/lib/app-dialog";

const LEVELS: AutonomyLevel[] = [0, 1, 2, 3];

export function AutonomyLevelPanel() {
  const qc = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ["user-preferences-me"],
    queryFn: fetchUserPreferences,
  });
  const { data: orgDefault } = useQuery({
    queryKey: ["autonomy-default"],
    queryFn: fetchAutonomyDefault,
  });

  const [level, setLevel] = useState<AutonomyLevel>(1);

  useEffect(() => {
    const userLevel = me?.support_autonomy_level;
    if (userLevel !== undefined) {
      setLevel(coerceLevel(userLevel));
      return;
    }
    if (orgDefault?.level !== undefined) setLevel(coerceLevel(orgDefault.level));
  }, [me, orgDefault]);

  const saveMutation = useMutation({
    mutationFn: (next: AutonomyLevel) =>
      updateUserPreferences({ support_autonomy_level: next }),
    onSuccess: async (updated) => {
      await qc.invalidateQueries({ queryKey: ["user-preferences-me"] });
      qc.setQueryData(["user-preferences-me"], updated);
      await appAlert({
        title: "ذخیره شد",
        message: "سطح خودمختاری برای جلسه‌های بعدی اعمال شد.",
      });
    },
    onError: async () => {
      await appAlert({
        title: "خطا",
        message: "ذخیره سطح خودمختاری ممکن نشد.",
        tone: "danger",
      });
    },
  });

  const enabled = useFeatureFlag("graduated_autonomy_v1");
  if (!enabled) return null;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-stone-900">سطح خودمختاری پشتیبانی</h3>
          <p className="mt-0.5 text-xs text-stone-500">
            چقدر دستیار پلتفرم می‌تواند در رابط به‌صورت خودکار عمل کند
          </p>
        </div>
        <Badge variant={level >= 2 ? "success" : "muted"}>
          {AUTONOMY_LABELS[level]}
        </Badge>
      </CardHeader>
      <CardBody>
        <Stagger className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {LEVELS.map((lv) => {
              const selected = level === lv;
              return (
                <StaggerItem key={lv} variant="scaleIn">
                  <button
                    type="button"
                    onClick={() => setLevel(lv)}
                    className={
                      "w-full rounded-2xl border p-4 text-right transition duration-200 " +
                      (selected
                        ? "border-brand-400 bg-brand-50/50 ring-2 ring-brand-200"
                        : "border-stone-200 bg-white hover:border-brand-200 hover:bg-brand-50/20")
                    }
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-stone-900">
                        {AUTONOMY_LABELS[lv]}
                      </span>
                      <Sliders
                        className={
                          "h-4 w-4 " + (selected ? "text-brand-600" : "text-stone-300")
                        }
                        aria-hidden
                      />
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-stone-600">
                      {AUTONOMY_HELPERS[lv]}
                    </p>
                  </button>
                </StaggerItem>
              );
            })}
          </div>
          <StaggerItem variant="scaleIn" className="pt-1">
            <Button onClick={() => saveMutation.mutate(level)} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "در حال ذخیره…" : "ذخیره سطح"}
            </Button>
          </StaggerItem>
        </Stagger>
      </CardBody>
    </Card>
  );
}
