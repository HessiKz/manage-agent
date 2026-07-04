"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, Search } from "lucide-react";
import { performLogout } from "@/lib/logout-flow";
import { useAuthStore } from "@/stores/auth-store";
import { useUiStore } from "@/stores/ui-store";
import type { ViewMode } from "@/stores/ui-store";
import { Input } from "@/components/ui/input";
import { NotificationsPanel } from "./notifications-panel";
import { ViewModeToggle } from "./view-mode-toggle";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { easeOut } from "@/components/motion/variants";
import { cn } from "@/lib/utils";

const PATH_LABELS: Record<string, string> = {
  dashboard: "فضای کار",
  agents: "ایجنت‌ها",
  conversations: "گفت‌وگوها",
  admin: "ادمین",
  knowledge: "فایل‌ها و داده‌ها",
  users: "کاربران و دسترسی‌ها",
  settings: "تنظیمات",
};

function breadcrumb(pathname: string): string {
  const parts = pathname.split("?")[0].split("/").filter(Boolean);
  if (parts.length === 0) return "فضای کار / خانه";
  const mapped = parts.map((p) => PATH_LABELS[p] ?? p);
  if (mapped[0] === "فضای کار") return `${mapped[0]} / ${mapped[1] ?? "خانه"}`;
  return mapped.join(" / ");
}

export function Header({
  title,
  viewMode,
  onToggleViewMode,
  switching = false,
}: {
  title?: string;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  switching?: boolean;
  shellReveal?: boolean;
  loggingOut?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const reduced = useReducedMotion();
  const modeLabel = viewMode === "admin" ? "پنل ادمین" : "فضای کار";

  function handleLogout() {
    performLogout(router);
  }

  return (
    <header
      className="relative z-50 flex h-14 min-h-14 shrink-0 items-center justify-between gap-2 border-b border-surface-border/80 bg-white/80 px-3 backdrop-blur-md sm:h-16 sm:gap-3 sm:px-6"
      data-ma-guide="header"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <button
          type="button"
          className="focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-surface-border bg-white text-stone-700 transition-colors hover:bg-surface-muted lg:hidden"
          aria-label="باز کردن منو"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1 truncate text-[11px] text-stone-500 sm:text-xs">
            <span className="hidden sm:inline">شرکت نمونه ·</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={viewMode}
                initial={reduced ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: easeOut }}
                className={cn(
                  "shrink-0",
                  viewMode === "admin" ? "font-semibold text-brand-700" : undefined
                )}
              >
                {modeLabel}
              </motion.span>
            </AnimatePresence>
            <span className="hidden min-w-0 truncate text-stone-400 sm:inline">
              · {breadcrumb(pathname)}
            </span>
          </p>
          {title && (
            <h1 className="truncate text-base font-bold text-stone-900 sm:text-lg">{title}</h1>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="relative hidden md:block">
          <Search
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="جست‌وجو در ایجنت‌ها"
            placeholder="جست‌وجو در ایجنت‌ها…"
            className="w-64 bg-surface-muted/80 py-2 pr-9 pl-3"
          />
        </div>

        {user?.is_superuser && (
          <ViewModeToggle
            viewMode={viewMode}
            onToggle={onToggleViewMode}
            switching={switching}
            variant="header"
          />
        )}

        <NotificationsPanel />

        <div className="flex items-center gap-1.5 rounded-xl border border-surface-border bg-white px-2 py-1 shadow-sm sm:gap-2 sm:px-3 sm:py-1.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
            {user?.full_name?.charAt(0) ?? "?"}
          </div>
          <div className="hidden text-right text-xs sm:block">
            <p className="font-semibold text-stone-800">{user?.full_name}</p>
            <p className="text-stone-500">{user?.title ?? user?.department ?? "کاربر"}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="focus-ring cursor-pointer rounded-lg p-2 text-stone-500 transition-colors duration-200 hover:bg-red-50 hover:text-accent-red"
            title="خروج"
            aria-label="خروج از حساب"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
