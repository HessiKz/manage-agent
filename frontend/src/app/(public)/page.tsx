"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MotionReveal, Stagger, StaggerItem } from "@/components/motion/stagger";

export default function Home() {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const animate = !leaving;

  function goTo(href: string) {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      router.push(href);
    }, 360);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted/30 p-8">
      <MotionReveal
        variant="scaleIn"
        animate={animate}
        className="w-full max-w-2xl"
      >
        <Stagger
          animate={animate}
          direction={leaving ? "reverse" : "forward"}
          className="space-y-6 text-center"
          delayChildren={0.1}
          staggerChildren={0.08}
        >
          <StaggerItem variant="popIn">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-xl font-bold text-white shadow-glow">
              AI
            </div>
          </StaggerItem>
          <StaggerItem variant="popIn">
            <h1 className="text-5xl font-bold text-brand-700">پلتفرم سازمانی AI</h1>
          </StaggerItem>
          <StaggerItem variant="fadeIn">
            <p className="text-xl text-stone-600">Enterprise AI Agent Workspace · v0.1</p>
          </StaggerItem>
          <StaggerItem variant="slideUp">
            <p className="text-stone-500">
              مدیریت یکپارچه‌ی ۲۴+ ایجنت هوش مصنوعی برای تیم‌های مالی، منابع انسانی، پشتیبانی و
              فروش
            </p>
          </StaggerItem>
          <Stagger
            animate={animate}
            direction={leaving ? "reverse" : "forward"}
            delayChildren={0.05}
            staggerChildren={0.07}
            className="flex justify-center gap-4 pt-4"
          >
            <StaggerItem variant="scaleIn">
              <button
                type="button"
                onClick={() => goTo("/login")}
                disabled={leaving}
                className="rounded-xl bg-brand-600 px-6 py-3 font-medium text-white shadow-glow transition hover:bg-brand-700 disabled:opacity-70"
              >
                ورود به فضای کار
              </button>
            </StaggerItem>
            <StaggerItem variant="scaleIn">
              <button
                type="button"
                onClick={() => goTo("/dashboard")}
                disabled={leaving}
                className="rounded-xl border border-surface-border bg-white px-6 py-3 font-medium text-stone-700 transition hover:bg-surface-muted disabled:opacity-70"
              >
                داشبورد
              </button>
            </StaggerItem>
          </Stagger>
          <StaggerItem variant="fadeIn">
            <p className="pt-8 text-xs text-stone-400">SOC 2 · ISO 27001 · On-Prem / SaaS</p>
          </StaggerItem>
        </Stagger>
      </MotionReveal>
    </main>
  );
}
