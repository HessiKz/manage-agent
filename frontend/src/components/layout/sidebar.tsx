"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Briefcase,
  Cable,
  Database,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Settings,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import { cn, deptLabel } from "@/lib/utils";
import type { DepartmentCount } from "@/types";
import type { SidebarCounts } from "@/types";
import type { ViewMode } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { SharedLogo } from "@/components/motion/shared";
import { Stagger, StaggerItem } from "@/components/motion/stagger";

type WorkspaceNavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  admin?: boolean;
  countKey?: keyof SidebarCounts;
};

const WORKSPACE_NAV = [
  { href: "/dashboard", label: "فضای کار", icon: LayoutDashboard },
  { href: "/agents", label: "ایجنت‌های من", icon: Bot, countKey: "my_agents" },
  { href: "/conversations", label: "گفت‌وگوها", icon: MessageSquare, countKey: "conversations" },
  { href: "/knowledge", label: "فایل‌ها و داده‌ها", icon: Database, admin: true },
  { href: "/settings", label: "تنظیمات", icon: Settings },
] satisfies WorkspaceNavItem[];

const ADMIN_NAV = [
  { href: "/admin", label: "نمای کلی", icon: ShieldCheck, admin: true },
  { href: "/agents/create", label: "ایجنت جدید", icon: Wrench, admin: true },
  { href: "/integrations", label: "اتصالات", icon: Cable, admin: true },
  { href: "/users", label: "نقش‌ها و دسترسی", icon: Users, admin: true },
  { href: "/settings", label: "تنظیمات", icon: Settings, admin: true },
] satisfies WorkspaceNavItem[];

export function Sidebar({
  departments = [],
  counts,
  viewMode,
  onToggleViewMode,
  isSuperuser,
  shellReveal = false,
  loggingOut = false,
}: {
  departments?: DepartmentCount[];
  counts?: SidebarCounts;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  isSuperuser?: boolean;
  /** One-shot intro stagger after login → dashboard */
  shellReveal?: boolean;
  loggingOut?: boolean;
}) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const navItems = (viewMode === "admin" ? ADMIN_NAV : WORKSPACE_NAV).filter(
    (n) => !n.admin || isSuperuser
  ) as WorkspaceNavItem[];

  const shellMotion = shellReveal || loggingOut;
  const staggerAnimate = !loggingOut;
  const staggerDirection = loggingOut ? "reverse" : "forward";

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col bg-sidebar text-stone-300">
      <Stagger
        disabled={!shellMotion}
        initial={shellReveal}
        animate={staggerAnimate}
        direction={staggerDirection}
        delayChildren={0.08}
        staggerChildren={0.05}
        className="border-b border-white/10 px-5 py-6"
      >
        <div className="flex items-center gap-3">
          <SharedLogo size="sidebar" />
          <StaggerItem variant="slideRight">
            <div>
              <p className="text-xs text-stone-400">پلتفرم سازمانی</p>
              <p className="font-bold text-white">دستیار هوشمند</p>
            </div>
          </StaggerItem>
        </div>

        <StaggerItem variant="slideRight" className="mt-5">
          <UserCard
            user={user}
            isSuperuser={isSuperuser}
            viewMode={viewMode}
            onToggleViewMode={onToggleViewMode}
          />
        </StaggerItem>
      </Stagger>

      <nav className="flex-1 overflow-y-auto p-4">
        <Stagger
          disabled={!shellMotion}
          initial={shellReveal}
          animate={staggerAnimate}
          direction={staggerDirection}
          delayChildren={0.12}
          staggerChildren={0.04}
          className="space-y-1"
        >
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const count = item.countKey ? counts?.[item.countKey] : undefined;
            const link = (
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("nav-item", active ? "nav-item-active" : "nav-item-idle")}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {typeof count === "number" && (
                  <span
                    dir="ltr"
                    className={cn(
                      "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none",
                      active ? "bg-white/20 text-white" : "bg-white/10 text-stone-300"
                    )}
                  >
                    {count}
                  </span>
                )}
              </Link>
            );
            return (
              <StaggerItem key={item.href} variant="slideRight">
                {link}
              </StaggerItem>
            );
          })}

          {viewMode !== "admin" && (
            <StaggerItem variant="fadeIn" className="pt-5">
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">
                دپارتمان‌ها
              </p>
            </StaggerItem>
          )}

          {viewMode !== "admin" &&
            departments.map((d) => (
              <StaggerItem key={d.department} variant="slideRight">
                <Link
                  href={`/agents?dept=${d.department}`}
                  className="nav-item nav-item-idle justify-between"
                >
                  <span>{deptLabel(d.department)}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-stone-400">
                    {d.count}
                  </span>
                </Link>
              </StaggerItem>
            ))}

          {viewMode !== "admin" && (
            <StaggerItem variant="slideRight" className="pt-3">
              <Link
                href="/admin"
                className={cn(
                  "nav-item",
                  isActive("/admin") ? "nav-item-active" : "nav-item-idle"
                )}
              >
                <Shield className="h-4 w-4" />
                <span className="flex-1">پنل ادمین</span>
                {typeof counts?.unread_notifications === "number" &&
                  counts.unread_notifications > 0 && (
                    <span
                      dir="ltr"
                      className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-accent-red px-2 py-0.5 text-xs font-bold leading-none text-white"
                    >
                      {counts.unread_notifications > 9 ? "9+" : counts.unread_notifications}
                    </span>
                  )}
              </Link>
            </StaggerItem>
          )}
        </Stagger>
      </nav>
    </aside>
  );
}

function UserCard({
  user,
  isSuperuser,
  viewMode,
  onToggleViewMode,
}: {
  user: ReturnType<typeof useAuthStore.getState>["user"];
  isSuperuser?: boolean;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
          {user?.full_name?.charAt(0) ?? "؟"}
        </div>
        <div className="min-w-0 text-right">
          <p className="truncate text-xs font-bold text-white">{user?.full_name ?? "—"}</p>
          <p className="truncate text-[11px] text-stone-400">
            {user?.department ?? "—"} · {user?.is_superuser ? "ادمین" : "کاربر"}
          </p>
        </div>
      </div>

      {isSuperuser && (
        <button
          type="button"
          onClick={onToggleViewMode}
          className="focus-ring-inset inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-stone-300 transition-colors duration-200 hover:bg-white/20 hover:text-white"
          title="تغییر نما"
        >
          <Briefcase className="h-3.5 w-3.5" />
          {viewMode === "admin" ? "ادمین" : "فضای کار"}
        </button>
      )}
    </div>
  );
}
