"use client";

import { AuthGuard } from "@/components/auth/auth-guard";
import { ErrorBoundary } from "@/components/error/error-boundary";
import { AppShell } from "@/components/layout/app-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>
        <ErrorBoundary segment="dashboard">{children}</ErrorBoundary>
      </AppShell>
    </AuthGuard>
  );
}
