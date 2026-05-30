"use client";

import { usePathname, useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { performLogout } from "@/lib/logout-flow";
import { useAuthStore } from "@/stores/auth-store";
import type { ViewMode } from "@/stores/ui-store";
import { Input } from "@/components/ui/input";
import { NotificationsPanel } from "./notifications-panel";

const PATH_LABELS: Record<string, string> = {
  dashboard: "فضای کار",
  agents: "ایجنت‌ها",
  conversations: "گفت‌وگوها",
  admin: "ادمین",
  integrations: "اتصالات",
  knowledge: "فایل‌ها و داده‌ها",
  users: "نقش‌ها و دسترسی",
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
}: {
  title?: string;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  shellReveal?: boolean;
  loggingOut?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  function handleLogout() {
    performLogout(router);
  }

  return (
    <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-surface-border/80 bg-white/80 px-6 backdrop-blur-md">
      <div>
        <p className="text-xs text-stone-500">
          شرکت نمونه · {viewMode === "admin" ? "پنل ادمین" : "فضای کار"} ·{" "}
          <span className="text-stone-400">{breadcrumb(pathname)}</span>
        </p>
        {title && <h1 className="text-lg font-bold text-stone-900">{title}</h1>}
      </div>

      <div className="flex items-center gap-2">
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
          <button
            type="button"
            onClick={onToggleViewMode}
            className="btn-secondary hidden px-3 py-2 text-xs sm:inline-flex"
            title="تغییر نما"
          >
            {viewMode === "admin" ? "نمای فضای کار" : "نمای ادمین"}
          </button>
        )}

        <NotificationsPanel />

        <div className="flex items-center gap-2 rounded-xl border border-surface-border bg-white px-3 py-1.5 shadow-sm">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
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
