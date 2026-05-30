"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchDepartments, fetchMe, fetchSidebarCounts } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { hydrateViewModeFromStorage, useUiStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/motion/transitions";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

export function AppShell({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const viewMode = useUiStore((s) => s.viewMode);
  const toggleViewMode = useUiStore((s) => s.toggleViewMode);
  const loggingOut = useUiStore((s) => s.loggingOut);

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

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      <div className="flex h-full shrink-0">
        <Sidebar
          departments={departments}
          counts={sidebarCounts}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
          isSuperuser={user?.is_superuser}
          shellReveal={shellReveal}
          loggingOut={loggingOut}
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
          onToggleViewMode={toggleViewMode}
          shellReveal={shellReveal}
          loggingOut={loggingOut}
        />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <PageTransition animate={!loggingOut}>
            <div className="page-content min-h-full">{children}</div>
          </PageTransition>
        </main>
      </div>
    </div>
  );
}
