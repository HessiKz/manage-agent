"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { fetchDepartments, fetchMe, fetchSidebarCounts } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { hydrateViewModeFromStorage, useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/motion/transitions";
import { ViewModeSweep } from "@/components/motion/view-mode-transition";
import { useViewModeSwitch } from "@/hooks/use-view-mode-switch";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { PlatformSupportAssistant } from "@/components/support/platform-support-assistant";
import { SupportUiPlayerProvider } from "@/components/support/support-ui-player";
import { useDashboardSupportBridgeRegistry } from "@/hooks/use-dashboard-support-bridge";
import { useTestingSupportBridge } from "@/hooks/use-testing-support-bridge";

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const loggingOut = useUiStore((s) => s.loggingOut);
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const closeMobileNav = useUiStore((s) => s.closeMobileNav);
  const { viewMode, switchViewMode, switching, direction } = useViewModeSwitch();
  const reduced = useReducedMotion();

  const [shellReveal, setShellReveal] = useState(false);

  useEffect(() => {
    hydrateViewModeFromStorage();
    if (sessionStorage.getItem("ma_just_logged_in") === "1") {
      sessionStorage.removeItem("ma_just_logged_in");
      sessionStorage.setItem("ma_shell_revealed", "1");
      setShellReveal(true);
    }
  }, []);

  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: fetchMe,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: fetchDepartments,
  });

  const { data: sidebarCounts } = useQuery({
    queryKey: ["sidebar-counts"],
    queryFn: fetchSidebarCounts,
  });

  useEffect(() => {
    if (me) setUser(me);
  }, [me, setUser]);

  useDashboardSupportBridgeRegistry();
  useTestingSupportBridge();

  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const pageTransitionKey = `${pathname}-${viewMode}`;

  return (
    <SupportUiPlayerProvider>
      <div className="flex h-[100dvh] overflow-hidden bg-surface-muted">
        <AnimatePresence>
          {mobileNavOpen && (
            <motion.button
              type="button"
              aria-label="بستن منو"
              className="fixed inset-0 z-40 bg-stone-900/45 backdrop-blur-[2px] lg:hidden"
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={closeMobileNav}
            />
          )}
        </AnimatePresence>

        <div
          className={cn(
            "fixed inset-y-0 right-0 z-50 h-full shrink-0 transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0",
            mobileNavOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          )}
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <Sidebar
            departments={departments}
            counts={sidebarCounts}
            viewMode={viewMode}
            onToggleViewMode={switchViewMode}
            switching={switching}
            switchDirection={direction}
            isSuperuser={user?.is_superuser}
            shellReveal={shellReveal}
            loggingOut={loggingOut}
            onNavClick={closeMobileNav}
          />
        </div>

        <div
          className={cn(
            "flex min-h-0 min-w-0 flex-1 flex-col transition-opacity duration-300 ease-out",
            loggingOut && "pointer-events-none opacity-0"
          )}
        >
          <Header
            title={title}
            viewMode={viewMode}
            onToggleViewMode={switchViewMode}
            switching={switching}
            shellReveal={shellReveal}
            loggingOut={loggingOut}
          />
          <main
            id="ma-main-scroll"
            className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
          >
            <ViewModeSweep active={switching} direction={direction} />
            <PageTransition
              animate={!loggingOut}
              transitionKey={pageTransitionKey}
            >
              <div className="page-content min-h-full">{children}</div>
            </PageTransition>
          </main>
        </div>
        <PlatformSupportAssistant />
      </div>
    </SupportUiPlayerProvider>
  );
}
