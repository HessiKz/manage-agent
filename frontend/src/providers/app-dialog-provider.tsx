"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { easeOut } from "@/components/motion/variants";
import {
  registerAppDialog,
  type AlertDialogOptions,
  type ConfirmDialogOptions,
} from "@/lib/app-dialog";

type DialogState =
  | { kind: "confirm"; options: ConfirmDialogOptions; resolve: (v: boolean) => void }
  | { kind: "alert"; options: AlertDialogOptions; resolve: () => void }
  | null;

const AppDialogContext = createContext<{
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  alert: (options: AlertDialogOptions) => Promise<void>;
} | null>(null);

export function useAppDialog() {
  const ctx = useContext(AppDialogContext);
  if (!ctx) {
    throw new Error("useAppDialog must be used within AppDialogProvider");
  }
  return ctx;
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const close = useCallback(() => setDialog(null), []);

  const confirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      setDialog({ kind: "confirm", options, resolve });
    });
  }, []);

  const alert = useCallback((options: AlertDialogOptions) => {
    return new Promise<void>((resolve) => {
      setDialog({ kind: "alert", options, resolve });
    });
  }, []);

  useEffect(() => {
    registerAppDialog({ confirm, alert });
    return () => registerAppDialog(null);
  }, [confirm, alert]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dialog.kind === "confirm") dialog.resolve(false);
        else dialog.resolve();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, close]);

  const tone = dialog?.options.tone ?? "default";
  const isDanger = tone === "danger";
  const title =
    dialog?.kind === "alert"
      ? dialog.options.title ?? (isDanger ? "خطا" : "توجه")
      : dialog?.options.title ?? "تأیید";

  const overlayVariants = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  const panelVariants = reduced
    ? { initial: { opacity: 1, scale: 1 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 1, scale: 1 } }
    : {
        initial: { opacity: 0, scale: 0.96, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
        exit: { opacity: 0, scale: 0.98, y: 6 },
      };

  const modal =
    mounted && dialog ? (
      <AnimatePresence>
        <motion.div
          key="app-dialog-root"
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          role="presentation"
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <motion.button
            type="button"
            aria-label="بستن"
            className="absolute inset-0 bg-stone-900/45 backdrop-blur-[2px]"
            variants={overlayVariants}
            transition={{ duration: 0.18, ease: easeOut }}
            onClick={() => {
              if (dialog.kind === "confirm") dialog.resolve(false);
              else dialog.resolve();
              close();
            }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="app-dialog-title"
            aria-describedby="app-dialog-message"
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-2xl"
            variants={panelVariants}
            transition={{ duration: 0.2, ease: easeOut }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4 p-6">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  isDanger ? "bg-accent-red/10 text-accent-red" : "bg-brand-50 text-brand-700"
                }`}
              >
                {isDanger ? (
                  <AlertTriangle className="h-5 w-5" aria-hidden />
                ) : (
                  <Info className="h-5 w-5" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="app-dialog-title" className="text-lg font-bold text-stone-900">
                  {title}
                </h2>
                <p id="app-dialog-message" className="mt-2 text-sm leading-relaxed text-stone-600">
                  {dialog.options.message}
                </p>
              </div>
            </div>
            <div className="flex flex-row-reverse flex-wrap gap-2 border-t border-stone-100 bg-stone-50/80 px-6 py-4">
              {dialog.kind === "confirm" ? (
                <>
                  <Button
                    variant={isDanger ? "danger" : "primary"}
                    onClick={() => {
                      dialog.resolve(true);
                      close();
                    }}
                  >
                    {dialog.options.confirmLabel ?? "تأیید"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      dialog.resolve(false);
                      close();
                    }}
                  >
                    {dialog.options.cancelLabel ?? "انصراف"}
                  </Button>
                </>
              ) : (
                <Button
                  variant={isDanger ? "danger" : "primary"}
                  onClick={() => {
                    dialog.resolve();
                    close();
                  }}
                >
                  {dialog.options.confirmLabel ?? "متوجه شدم"}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    ) : null;

  return (
    <AppDialogContext.Provider value={{ confirm, alert }}>
      {children}
      {mounted && modal ? createPortal(modal, document.body) : null}
    </AppDialogContext.Provider>
  );
}
