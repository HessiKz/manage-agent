"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Lock, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  title?: string;
  editable?: boolean;
  onRemove?: () => void;
  removing?: boolean;
  className?: string;
  widgetKind?: string;
};

export function DashboardWidgetShell({
  children,
  title,
  editable,
  onRemove,
  removing,
  className,
  widgetKind,
}: Props) {
  if (!editable) {
    return (
      <div className={className} data-ma-widget={widgetKind}>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("group relative", className)} data-ma-widget={widgetKind}>
      {editable && onRemove && (
        <button
          type="button"
          disabled={removing}
          onClick={onRemove}
          className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-stone-200 bg-white/95 text-stone-500 shadow-sm opacity-0 transition hover:border-accent-red/40 hover:bg-accent-red/5 hover:text-accent-red group-hover:opacity-100 disabled:opacity-40"
          title={title ? `حذف ${title}` : "حذف ویجت"}
          aria-label={title ? `حذف ${title}` : "حذف ویجت"}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {children}
    </div>
  );
}

export function DashboardAddWidgetTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[120px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50/40 text-brand-700 transition hover:border-brand-400 hover:bg-brand-50"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100">
        <Plus className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold">افزودن ویجت</span>
    </button>
  );
}

const POPOVER_WIDTH = 240;
const VIEWPORT_PAD = 12;
const GAP = 8;

function clampPopoverPosition(
  anchor: DOMRect,
  popoverHeight: number
): { top: number; left: number } {
  const spaceBelow = window.innerHeight - anchor.bottom - VIEWPORT_PAD;
  const spaceAbove = anchor.top - VIEWPORT_PAD;
  const openAbove = spaceBelow < popoverHeight + GAP && spaceAbove >= spaceBelow;

  let top = openAbove
    ? anchor.top - popoverHeight - GAP
    : anchor.bottom + GAP;

  let left = anchor.right - POPOVER_WIDTH;
  left = Math.max(VIEWPORT_PAD, Math.min(left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PAD));
  top = Math.max(VIEWPORT_PAD, Math.min(top, window.innerHeight - popoverHeight - VIEWPORT_PAD));

  return { top, left };
}

export function WidgetPickerPopover({
  open,
  onClose,
  options,
  onPick,
  onCreateCustom,
  createCustomLocked = false,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  options: { kind: string; label: string; locked?: boolean; lockReason?: string }[];
  onPick: (kind: string) => void;
  onCreateCustom: () => void;
  createCustomLocked?: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPosition(null);
      return;
    }

    function updatePosition() {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const popover = popoverRef.current;
      if (!anchor) return;
      const height = popover?.offsetHeight ?? 280;
      setPosition(clampPopoverPosition(anchor, height));
    }

    updatePosition();
    const raf = requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, anchorRef, options.length]);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open, onClose, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const panel = (
    <div
      ref={popoverRef}
      role="menu"
      className="fixed z-[140] overflow-hidden rounded-xl border border-surface-border bg-white shadow-[0_16px_48px_-8px_rgba(28,25,23,0.22)]"
      style={{
        width: POPOVER_WIDTH,
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        visibility: position ? "visible" : "hidden",
      }}
    >
      <div className="border-b border-stone-100 bg-stone-50/80 px-3 py-2.5 text-xs font-semibold text-stone-600">
        ویجت‌های موجود
      </div>
      <ul className="max-h-[min(12rem,40vh)] overflow-y-auto py-1">
        {options.length === 0 ? (
          <li className="px-3 py-2.5 text-xs text-stone-400">همه ویجت‌ها فعال هستند</li>
        ) : (
          options.map((opt) => (
            <li key={opt.kind}>
              <button
                type="button"
                role="menuitem"
                disabled={opt.locked}
                title={opt.lockReason}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-right text-sm transition",
                  opt.locked
                    ? "cursor-not-allowed text-stone-400"
                    : "text-stone-700 hover:bg-brand-50"
                )}
                onClick={() => {
                  if (opt.locked) return;
                  onPick(opt.kind);
                  onClose();
                }}
              >
                <span>{opt.label}</span>
                {opt.locked && <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              </button>
            </li>
          ))
        )}
      </ul>
      <button
        type="button"
        role="menuitem"
        disabled={createCustomLocked}
        className={cn(
          "w-full border-t border-stone-100 px-3 py-3 text-right text-sm font-semibold transition",
          createCustomLocked
            ? "cursor-not-allowed bg-stone-50 text-stone-400"
            : "bg-brand-50/30 text-brand-700 hover:bg-brand-50"
        )}
        onClick={() => {
          if (createCustomLocked) return;
          onCreateCustom();
          onClose();
        }}
      >
        + ساخت ویجت سفارشی…
      </button>
    </div>
  );

  return createPortal(panel, document.body);
}
