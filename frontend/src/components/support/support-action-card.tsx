"use client";

import { ArrowLeft, Bot, LayoutGrid, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applySupportUiAction,
  supportActionLabel,
  type SupportUiAction,
} from "@/lib/page-guide-context";
import { cn } from "@/lib/utils";
import { plainTextPreview } from "@/lib/plain-text-preview";

type Props = {
  action: SupportUiAction;
  onNavigate: (path: string) => void;
  className?: string;
};

function ActionIcon({ kind }: { kind?: SupportUiAction["kind"] }) {
  if (kind === "widget_generated") return <LayoutGrid className="h-4 w-4" />;
  if (kind === "agent_created") return <Bot className="h-4 w-4" />;
  return <Sparkles className="h-4 w-4" />;
}

export function SupportActionCard({ action, onNavigate, className }: Props) {
  return (
    <div
      className={cn(
        "mt-2 overflow-hidden rounded-xl border border-brand-200/70 bg-white text-stone-800 shadow-sm",
        className
      )}
    >
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <ActionIcon kind={action.kind} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-brand-800">نتیجه عملیات</p>
          {action.preview ? (
            <p className="mt-0.5 text-xs leading-relaxed text-stone-600">
              {plainTextPreview(action.preview)}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-stone-500">برای دیدن نتیجه روی دکمه بزنید.</p>
          )}
        </div>
      </div>
      <div className="border-t border-brand-100/80 bg-brand-50/40 px-3.5 py-2.5">
        <Button
          type="button"
          className="h-9 w-full gap-2 text-sm"
          onClick={() => applySupportUiAction(action, onNavigate)}
        >
          {supportActionLabel(action)}
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
