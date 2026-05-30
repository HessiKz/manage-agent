"use client";

import { Info } from "lucide-react";
import { StaggerItem } from "@/components/motion/stagger";

type Props = {
  title: string;
  description: string;
  tip?: string;
};

export function WizardStepIntro({ title, description, tip }: Props) {
  return (
    <StaggerItem variant="fadeIn">
      <div className="rounded-2xl border border-brand-200/80 bg-gradient-to-l from-brand-50/90 to-white px-4 py-3">
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Info className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="font-bold text-stone-900">{title}</p>
            <p className="text-sm leading-relaxed text-stone-600">{description}</p>
            {tip && (
              <p className="text-xs leading-relaxed text-brand-800/90">
                <span className="font-semibold">نکته:</span> {tip}
              </p>
            )}
          </div>
        </div>
      </div>
    </StaggerItem>
  );
}
