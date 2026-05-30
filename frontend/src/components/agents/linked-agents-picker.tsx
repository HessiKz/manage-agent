"use client";

import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { Agent, AgentLink, AgentLinkType } from "@/types";

type Props = {
  agents: Agent[];
  links: AgentLink[];
  supervisorMode: boolean;
  canCallAgents: boolean;
  onChange: (links: AgentLink[]) => void;
};

export function LinkedAgentsPicker({
  agents,
  links,
  supervisorMode,
  canCallAgents,
  onChange,
}: Props) {
  if (!supervisorMode && !canCallAgents) return null;

  const linkType: AgentLinkType = supervisorMode ? "supervises" : "tool";

  function toggleAgent(agent: Agent) {
    const exists = links.find(
      (l) => l.callee_agent_id === agent.id && l.link_type === linkType
    );
    if (exists) {
      onChange(links.filter((l) => !(l.callee_agent_id === agent.id && l.link_type === linkType)));
    } else {
      onChange([
        ...links,
        {
          callee_agent_id: agent.id,
          link_type: linkType,
          requires_user_permission: true,
          description: `فراخوانی ${agent.name}`,
          callee_name: agent.name,
          callee_slug: agent.slug,
        },
      ]);
    }
  }

  function togglePerm(calleeId: string) {
    onChange(
      links.map((l) =>
        l.callee_agent_id === calleeId && l.link_type === linkType
          ? { ...l, requires_user_permission: !l.requires_user_permission }
          : l
      )
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-stone-800">
        {supervisorMode ? "زیرایجنت‌های سرپرست" : "ایجنت‌های قابل فراخوانی"}
      </p>
      <p className="text-xs leading-relaxed text-stone-500">
        {supervisorMode
          ? "درخواست کاربر را به یکی از این ایجنت‌ها هدایت می‌شود — مثل ارجاع به کارشناس حقوق یا پشتیبانی."
          : "این ایجنت می‌تواند از نتیجه ایجنت‌های دیگر کمک بگیرد — بدون اینکه کاربر مستقیم آن‌ها را باز کند."}
      </p>
      <Stagger initial={false} className="max-h-48 space-y-2 overflow-y-auto">
        {agents.map((a) => {
          const selected = links.some(
            (l) => l.callee_agent_id === a.id && l.link_type === linkType
          );
          const link = links.find(
            (l) => l.callee_agent_id === a.id && l.link_type === linkType
          );
          return (
            <StaggerItem key={a.id} variant="slideUp">
              <label className="flex flex-wrap items-center gap-3 rounded-xl border border-stone-200 bg-white p-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleAgent(a)}
                />
                <span className="min-w-[120px] flex-1 font-medium text-stone-800">
                  {a.name}
                </span>
                {selected && link && (
                  <label className="flex items-center gap-1 text-xs text-stone-500">
                    <input
                      type="checkbox"
                      checked={link.requires_user_permission}
                      onChange={() => togglePerm(a.id)}
                    />
                    نیاز به دسترسی کاربر
                  </label>
                )}
              </label>
            </StaggerItem>
          );
        })}
      </Stagger>
    </div>
  );
}
