"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, CheckCheck, X } from "lucide-react";
import {
  fetchNotificationCount,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { easeOut } from "@/components/motion/variants";

export function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const reduced = useReducedMotion();

  const { data: count = { unread: 0 } } = useQuery({
    queryKey: ["notification-count"],
    queryFn: fetchNotificationCount,
    refetchInterval: 30_000,
  });

  const { data: items = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(false),
    enabled: open,
  });

  async function markRead(id: string) {
    await markNotificationRead(id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notification-count"] });
  }

  async function markAll() {
    await markAllNotificationsRead();
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notification-count"] });
  }

  const panelVariants = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: -10, scale: 0.97 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -8, scale: 0.98 },
      };

  const backdropVariants = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="focus-ring relative cursor-pointer rounded-xl p-2.5 text-stone-600 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-700"
        aria-label="اعلان‌ها"
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {count.unread > 0 && (
          <span className="absolute left-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
            {count.unread > 9 ? "9+" : count.unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="notifications-backdrop"
              className="fixed inset-0 z-[70]"
              variants={backdropVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.14, ease: easeOut }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              key="notifications-panel"
              className="absolute left-0 top-full z-[80] mt-2 w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl"
              variants={panelVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.18, ease: easeOut }}
            >
              <Stagger
                delayChildren={0.04}
                staggerChildren={0.05}
                className="max-h-80 overflow-y-auto"
              >
                <StaggerItem variant="slideDown">
                  <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
                    <h3 className="font-bold text-stone-800">اعلان‌ها</h3>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={markAll}
                        className="focus-ring cursor-pointer rounded-lg p-1.5 text-stone-500 transition-colors duration-200 hover:bg-stone-100"
                        title="خواندن همه"
                        aria-label="علامت‌گذاری همه به‌عنوان خوانده‌شده"
                      >
                        <CheckCheck className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="focus-ring cursor-pointer rounded-lg p-1.5 text-stone-500 transition-colors duration-200 hover:bg-stone-100"
                        aria-label="بستن اعلان‌ها"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </StaggerItem>

                {items.length === 0 && (
                  <StaggerItem variant="fadeIn">
                    <p className="p-6 text-center text-sm text-stone-400">اعلانی نیست</p>
                  </StaggerItem>
                )}
                {items.map((n) => (
                  <StaggerItem key={n.id} variant="slideRight">
                    <div
                      className={cn(
                        "border-b border-stone-50 px-4 py-3 text-sm transition hover:bg-brand-50/50",
                        !n.is_read && "bg-brand-50/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-stone-800">{n.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-stone-500">{n.message}</p>
                          {n.link && (
                            <Link
                              href={n.link}
                              onClick={() => {
                                markRead(n.id);
                                setOpen(false);
                              }}
                            className="mt-1 inline-block cursor-pointer text-xs font-medium text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 rounded"
                          >
                              مشاهده
                            </Link>
                          )}
                        </div>
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={() => markRead(n.id)}
                            className="focus-ring shrink-0 cursor-pointer rounded px-1 text-xs font-medium text-brand-600 transition-colors duration-200 hover:text-brand-800"
                          >
                            خواندم
                          </button>
                        )}
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
