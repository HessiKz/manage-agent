"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { fetchMe, logout } from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth-token";
import { useAuthStore } from "@/stores/auth-store";
import { useMounted } from "@/hooks/use-mounted";
import { LoadingIndicator } from "@/components/loading";

function AuthLoading({ slowLoad }: { slowLoad?: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted/30 px-6">
      <LoadingIndicator
        size="panel"
        stage="در حال بارگذاری فضای کار…"
        detail={
          slowLoad
            ? "سرور ممکن است مشغول تست ایجنت باشد — چند ثانیه دیگر صبر کنید."
            : undefined
        }
      />
    </div>
  );
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const mounted = useMounted();
  const router = useRouter();
  const setUser = useAuthStore((s) => s.setUser);
  const user = useAuthStore((s) => s.user);
  const [authed, setAuthed] = useState(false);
  const [slowLoad, setSlowLoad] = useState(false);

  useEffect(() => {
    if (!mounted) return;

    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlowLoad(true);
    }, 4000);

    void getValidAccessToken().then((token) => {
      if (cancelled) return;
      if (!token) {
        logout();
        router.replace("/login");
        return;
      }

      if (user) {
        setAuthed(true);
        return;
      }

      fetchMe()
        .then((u) => {
          if (cancelled) return;
          setUser(u);
          setAuthed(true);
        })
        .catch(() => {
          if (cancelled) return;
          logout();
          router.replace("/login");
        })
        .finally(() => {
          window.clearTimeout(slowTimer);
        });
    });

    return () => {
      cancelled = true;
      window.clearTimeout(slowTimer);
    };
  }, [mounted, router, setUser, user]);

  if (!mounted || !authed) {
    return <AuthLoading slowLoad={mounted && slowLoad && !authed} />;
  }

  return <>{children}</>;
}