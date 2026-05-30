"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { fetchMe } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useMounted } from "@/hooks/use-mounted";

function AuthLoading({ slowLoad }: { slowLoad?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface-muted/30">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      <p className="text-sm text-stone-500">در حال بارگذاری فضای کار…</p>
      {slowLoad && (
        <p className="max-w-sm px-6 text-center text-xs leading-relaxed text-stone-400">
          سرور ممکن است مشغول تست ایجنت باشد — چند ثانیه دیگر صبر کنید.
        </p>
      )}
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

    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }

    if (user) {
      setAuthed(true);
      return;
    }

    let cancelled = false;
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setSlowLoad(true);
    }, 4000);

    fetchMe()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setAuthed(true);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        useAuthStore.getState().clear();
        router.replace("/login");
      })
      .finally(() => {
        window.clearTimeout(slowTimer);
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
