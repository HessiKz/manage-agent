"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
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
import type { ViewModeDirection } from "@/hooks/use-view-mode-switch";
import { SharedLogo } from "@/components/motion/shared";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import {
  getViewModeNavVariants,
  viewModeNavTransition,
} from "@/components/motion/variants";
import { ViewModeToggle } from "./view-mode-toggle";

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
  { href: "/settings", label: "تنظیمات", icon: Settings },
] satisfies WorkspaceNavItem[];

const ADMIN_NAV = [
  { href: "/admin", label: "نمای کلی", icon: ShieldCheck, admin: true },
  { href: "/admin/agents", label: "مدیریت ایجنت‌ها", icon: Bot, admin: true },
  { href: "/agents/create", label: "ایجاد ایجنت جدید", icon: Wrench, admin: true },
  { href: "/admin/knowledge", label: "پایگاه دانش", icon: Database, admin: true },
  { href: "/users", label: "کاربران و دسترسی‌ها", icon: Users, admin: true },
  { href: "/settings", label: "تنظیمات", icon: Settings, admin: true },
] satisfies WorkspaceNavItem[];

export function Sidebar({
  departments = [],
  counts,
  viewMode,
  onToggleViewMode,
  switching = false,
  switchDirection = "to-admin",
  isSuperuser,
  shellReveal = false,
  loggingOut = false,
  onNavClick,
}: {
  departments?: DepartmentCount[];
  counts?: SidebarCounts;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  switching?: boolean;
  switchDirection?: ViewModeDirection;
  isSuperuser?: boolean;
  /** One-shot intro stagger after login → dashboard */
  shellReveal?: boolean;
  loggingOut?: boolean;
  onNavClick?: () => void;
}) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const reduced = useReducedMotion();
  const navVariants = getViewModeNavVariants(!!reduced, switchDirection);

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    if (href === "/admin") return pathname === "/admin" || pathname === "/admin/";
    return pathname === href || pathname.startsWith(href + "/");
  }

  const navItems =
    viewMode === "admin"
      ? (ADMIN_NAV.filter((n) => !n.admin || isSuperuser) as WorkspaceNavItem[])
      : WORKSPACE_NAV;

  const shellMotion = shellReveal || loggingOut;
  const staggerAnimate = !loggingOut;
  const staggerDirection = loggingOut ? "reverse" : "forward";

  return (
    <aside
      className="relative flex h-full w-[min(18rem,88vw)] max-w-[18rem] shrink-0 flex-col bg-sidebar text-stone-300 shadow-2xl lg:w-72 lg:max-w-none lg:shadow-none"
      data-ma-guide="sidebar"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <motion.div
        className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-brand-400 via-brand-500 to-accent-green"
        initial={false}
        animate={{ opacity: viewMode === "admin" ? 1 : 0, scaleY: viewMode === "admin" ? 1 : 0.6 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden
      />
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
            switching={switching}
          />
        </StaggerItem>
      </Stagger>

      <nav className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={viewMode}
            variants={navVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={viewModeNavTransition}
            className="space-y-1"
          >
            {navItems.map((item, index) => {
              const active = isActive(item.href);
              const Icon = item.icon;
              const count = item.countKey ? counts?.[item.countKey] : undefined;
              return (
                <motion.div
                  key={item.href}
                  initial={reduced ? false : { opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    duration: 0.18,
                    delay: reduced ? 0 : 0.04 + index * 0.035,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavClick}
                    className={cn("nav-item min-h-11", active ? "nav-item-active" : "nav-item-idle")}
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
                </motion.div>
              );
            })}

            {viewMode !== "admin" && (
              <motion.p
                initial={reduced ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.12 }}
                className="px-3 pb-2 pt-5 text-xs font-semibold uppercase tracking-wide text-stone-500"
              >
                دپارتمان‌ها
              </motion.p>
            )}

            {viewMode !== "admin" &&
              departments.map((d, index) => (
                <motion.div
                  key={d.department}
                  initial={reduced ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.14 + index * 0.03, duration: 0.16 }}
                >
                  <Link
                    href={`/agents?dept=${d.department}`}
                    onClick={onNavClick}
                    className="nav-item nav-item-idle min-h-11 justify-between"
                  >
                    <span>{deptLabel(d.department)}</span>
                    <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-stone-400">
                      {d.count}
                    </span>
                  </Link>
                </motion.div>
              ))}

            {viewMode !== "admin" && (
              <motion.div
                className="pt-3"
                initial={reduced ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2, duration: 0.18 }}
              >
                <Link
                  href="/admin"
                  onClick={onNavClick}
                  className={cn(
                    "nav-item min-h-11",
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
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </nav>
    </aside>
  );
}

function UserCard({
  user,
  isSuperuser,
  viewMode,
  onToggleViewMode,
  switching = false,
}: {
  user: ReturnType<typeof useAuthStore.getState>["user"];
  isSuperuser?: boolean;
  viewMode: ViewMode;
  onToggleViewMode: () => void;
  switching?: boolean;
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
        <ViewModeToggle
          viewMode={viewMode}
          onToggle={onToggleViewMode}
          switching={switching}
          variant="sidebar"
        />
      )}
    </div>
  );
}
