"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessageCircle, X } from "lucide-react";
import { CapabilityAwarePanel } from "@/components/agents/capability-aware-panel";
import type { ChatExchange } from "@/components/agents/chat-panel";
import { AgentTestPanel } from "@/components/agents/agent-test-panel";
import { easeOut } from "@/components/motion/variants";
import { Button } from "@/components/ui/button";
import type { Agent } from "@/types";

type Props = {
  agent: Agent;
  open: boolean;
  onClose: () => void;
  initialMessage?: string | null;
  chatExchange?: ChatExchange | null;
  onChatExchange?: (exchange: ChatExchange) => void;
  onChatExchangeConsumed?: () => void;
  showAdminTest?: boolean;
};

export function AgentChatSheet({
  agent,
  open,
  onClose,
  initialMessage,
  chatExchange,
  onChatExchange,
  onChatExchangeConsumed,
  showAdminTest = false,
}: Props) {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const panelVariants = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { opacity: 0, x: -32 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 },
      };

  const backdropVariants = reduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="بستن گفت‌وگو"
            className="fixed inset-0 z-[60] bg-sidebar/40 backdrop-blur-[2px]"
            variants={backdropVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.18, ease: easeOut }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="agent-chat-title"
            className="fixed inset-y-0 left-0 z-[70] flex w-full max-w-lg flex-col border-r border-surface-border bg-white shadow-2xl"
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.2, ease: easeOut }}
          >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <MessageCircle className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 text-right">
                  <h2 id="agent-chat-title" className="truncate text-sm font-bold text-stone-900">
                    گفت‌وگو با {agent.name}
                  </h2>
                  <p className="truncate text-xs text-stone-500">پرسش بپرسید یا نتیجه اقدامات را ببینید</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="focus-ring shrink-0 rounded-lg p-2 text-stone-500 transition-colors duration-200 hover:bg-stone-100 hover:text-stone-800"
                aria-label="بستن"
              >
                <X className="h-5 w-5" />
              </button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3">
              {showAdminTest && (
                <AgentTestPanel
                  agent={agent}
                  onChatExchange={(user, assistant) => onChatExchange?.({ user, assistant })}
                />
              )}
              <div className="min-h-0 flex-1 overflow-hidden">
                <CapabilityAwarePanel
                  agent={agent}
                  initialMessage={initialMessage}
                  chatExchange={chatExchange}
                  onChatExchange={onChatExchange}
                  onChatExchangeConsumed={onChatExchangeConsumed}
                />
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function AgentChatTrigger({
  onClick,
  chatEnabled = true,
  className,
}: {
  onClick: () => void;
  chatEnabled?: boolean;
  className?: string;
}) {
  return (
    <Button type="button" onClick={onClick} className={className}>
      <MessageCircle className="h-4 w-4" />
      {chatEnabled ? "شروع گفت‌وگو با ایجنت" : "مشاهده نتایج و اقدامات"}
    </Button>
  );
}
