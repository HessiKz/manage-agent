"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { fetchMe, login } from "@/lib/api";
import { getValidAccessToken } from "@/lib/auth-token";
import { getErrorMessage } from "@/lib/errors";
import { useAuthStore } from "@/stores/auth-store";
import { SharedLogo, setBrandMorphPending } from "@/components/motion/shared";
import { MotionReveal, Stagger, StaggerItem } from "@/components/motion/stagger";
import { ClientMonthYear } from "@/components/ui/client-date";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    void getValidAccessToken().then((token) => {
      if (token) router.replace("/dashboard");
    });
  }, [router]);

  async function finishLogin() {
    setLeaving(true);
    setBrandMorphPending();
    if (typeof window !== "undefined") {
      sessionStorage.setItem("ma_just_logged_in", "1");
    }
    window.setTimeout(() => {
      router.replace("/dashboard");
    }, 320);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email, password);
      // Don't block navigation on /auth/me — backend may be busy with agent validation.
      try {
        const me = await fetchMe();
        useAuthStore.getState().setUser(me);
      } catch {
        useAuthStore.getState().clear();
      }
      await finishLogin();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  const staggerDirection = leaving ? "reverse" : "forward";
  const staggerAnimate = !leaving;

  return (
    <main className="min-h-screen">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
        {/* Right hero panel — whole column slides in, then children stagger */}
        <MotionReveal
          variant="slideRight"
          animate={staggerAnimate}
          className="hidden flex-col justify-center bg-sidebar px-16 py-12 lg:flex"
        >
          <Stagger
            direction={staggerDirection}
            animate={staggerAnimate}
            delayChildren={0.05}
            staggerChildren={0.06}
            className="flex flex-col"
          >
            <StaggerItem variant="popIn" className="mb-10 flex items-center gap-3">
              <SharedLogo size="hero" />
              <div>
                <p className="font-bold text-white">پلتفرم سازمانی</p>
                <p className="text-xs text-stone-400">Enterprise AI Workspace</p>
              </div>
            </StaggerItem>

            <StaggerItem variant="fadeIn">
              <p className="mb-2 text-sm text-brand-400">
                نسخه ۲٫۱ · <ClientMonthYear />
              </p>
            </StaggerItem>
            <StaggerItem variant="slideRight">
              <h1 className="text-4xl font-extrabold leading-tight text-brand-400">
                ایجنت‌های هوشمند،
              </h1>
            </StaggerItem>
            <StaggerItem variant="slideRight">
              <h1 className="mb-4 text-4xl font-extrabold leading-tight text-white">
                یک پنل واحد.
              </h1>
            </StaggerItem>
            <StaggerItem variant="fadeIn">
              <p className="mb-10 text-stone-400">
                فضای کاری شما — از حقوق و دستمزد تا پاسخ تیکت‌ها — همه
                به‌صورت یکپارچه و با دسترسی‌های امن سازمانی.
              </p>
            </StaggerItem>

            <Stagger
              direction={staggerDirection}
              animate={staggerAnimate}
              delayChildren={0.02}
              staggerChildren={0.07}
              className="mb-12 flex gap-10 text-center"
            >
              <StaggerItem variant="popIn">
                <div>
                  <p className="text-2xl font-bold text-white">۲۴</p>
                  <p className="text-xs text-stone-500">ایجنت فعال</p>
                </div>
              </StaggerItem>
              <StaggerItem variant="popIn">
                <div>
                  <p className="text-2xl font-bold text-white">۸</p>
                  <p className="text-xs text-stone-500">دپارتمان</p>
                </div>
              </StaggerItem>
              <StaggerItem variant="popIn">
                <div>
                  <p className="text-2xl font-bold text-white">۹۹٫۹٪</p>
                  <p className="text-xs text-stone-500">پایداری</p>
                </div>
              </StaggerItem>
            </Stagger>

            <StaggerItem variant="fadeIn">
              <p className="text-xs text-stone-500">
                SOC 2 · Type II &nbsp; ISO 27001 &nbsp; On-Prem / SaaS
              </p>
            </StaggerItem>
          </Stagger>
        </MotionReveal>

        {/* Left form panel */}
        <MotionReveal
          variant="slideLeft"
          animate={staggerAnimate}
          className="flex flex-col items-center justify-center bg-white px-8 py-12"
        >
          <form onSubmit={onSubmit} className="w-full max-w-md">
            <Stagger
              direction={staggerDirection}
              animate={staggerAnimate}
              delayChildren={0.04}
              staggerChildren={0.05}
              className="space-y-5"
            >
              <StaggerItem variant="slideUp">
                <h2 className="text-center text-2xl font-bold text-stone-900">خوش آمدید</h2>
              </StaggerItem>
              <StaggerItem variant="slideUp">
                <p className="text-center text-sm text-stone-500">
                  با حساب سازمانی خود وارد شوید.
                </p>
              </StaggerItem>

              <StaggerItem variant="slideUp">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-stone-700">ایمیل سازمانی</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="focus-ring w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm transition-colors duration-200 focus:border-brand-400"
                    required
                  />
                </div>
              </StaggerItem>

              <StaggerItem variant="slideUp">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-stone-700">رمز عبور</label>
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-brand-600 transition-colors duration-200 hover:text-brand-800 focus-visible:underline focus-visible:outline-none"
                    >
                      فراموشی رمز؟
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="focus-ring w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm transition-colors duration-200 focus:border-brand-400"
                    required
                  />
                  <label className="flex items-center gap-2 pt-2 text-xs text-stone-500">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded accent-brand-500"
                    />
                    مرا روی این دستگاه به‌خاطر بسپار
                  </label>
                </div>
              </StaggerItem>

              {error && (
                <StaggerItem variant="fadeIn">
                  <p className="text-sm text-accent-red">{error}</p>
                </StaggerItem>
              )}

              <StaggerItem variant="scaleIn">
                <button
                  type="submit"
                  disabled={loading || leaving}
                  className="focus-ring w-full cursor-pointer rounded-xl bg-sidebar py-2.5 font-medium text-white transition-colors duration-200 hover:bg-sidebar-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading || leaving ? "در حال ورود..." : "ورود به فضای کار  ←"}
                </button>
              </StaggerItem>

              <StaggerItem variant="scaleIn">
                <div className="relative text-center text-sm text-stone-400">
                  <span className="bg-white px-2">یا</span>
                  <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-surface-border" />
                </div>
              </StaggerItem>

              <StaggerItem variant="scaleIn">
                <button
                  type="button"
                  disabled
                  className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-surface-border py-2.5 text-sm text-stone-500"
                >
                  <ShieldCheck className="h-4 w-4" />
                  ورود با SSO سازمان (SAML)
                </button>
              </StaggerItem>

              <StaggerItem variant="fadeIn">
                <p className="text-center text-[11px] text-stone-400">
                  با ادامه با <span className="text-brand-500">قوانین استفاده</span> موافقت
                  می‌کنید.
                </p>
              </StaggerItem>
              {process.env.NODE_ENV === "development" && (
                <StaggerItem variant="fadeIn">
                  <p className="rounded-xl bg-stone-50 px-3 py-2 text-center text-[11px] leading-relaxed text-stone-500">
                    حساب پیش‌فرض توسعه:{" "}
                    <span className="font-mono text-stone-700">admin@example.com</span>
                    {" / "}
                    <span className="font-mono text-stone-700">admin123</span>
                  </p>
                </StaggerItem>
              )}
            </Stagger>
          </form>
        </MotionReveal>
      </div>
    </main>
  );
}
