"use client";

import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { Badge } from "@/components/ui/badge";
import { KIND_LABELS } from "@/lib/agent-presets";
import type { Agent, AgentKind, AgentLink, AgentLinkType } from "@/types";

type Props = {
  agents: Agent[];
  links: AgentLink[];
  supervisorMode: boolean;
  canCallAgents: boolean;
  onChange: (links: AgentLink[]) => void;
};

function calleeCandidates(agents: Agent[], supervisorMode: boolean): Agent[] {
  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name, "fa"));
  if (!supervisorMode) return sorted;
  return sorted.filter((a) => a.kind !== "supervisor");
}

export function LinkedAgentsPicker({
  agents,
  links,
  supervisorMode,
  canCallAgents,
  onChange,
}: Props) {
  if (!supervisorMode && !canCallAgents) return null;

  const linkType: AgentLinkType = supervisorMode ? "supervises" : "tool";
  const candidates = calleeCandidates(agents, supervisorMode);

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
          requires_user_permission: supervisorMode ? false : true,
          description: supervisorMode
            ? `هدایت به ${agent.name}`
            : `فراخوانی ${agent.name}`,
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

  const selectedCount = links.filter((l) => l.link_type === linkType).length;

  return (
    <div className="space-y-3 rounded-2xl border border-brand-200/70 bg-brand-50/30 p-4">
      <div>
        <p className="text-sm font-semibold text-stone-900">
          {supervisorMode ? "زیرایجنت‌های قابل هدایت" : "ایجنت‌های قابل فراخوانی"}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-stone-600">
          {supervisorMode
            ? "سرپرست درخواست کاربر را به یکی از این ایجنت‌ها می‌فرستد — فقط ایجنت‌هایی که اینجا انتخاب کنید در دسترس هستند."
            : "این ایجنت می‌تواند از نتیجه ایجنت‌های انتخاب‌شده کمک بگیرد."}
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-200 bg-white px-3 py-4 text-xs text-stone-500">
          {supervisorMode
            ? "هنوز ایجنت زیرمجموعه‌ای وجود ندارد — ابتدا ایجنت «گفت‌وگو» یا «کارگر» بسازید، سپس اینجا انتخاب کنید."
            : "ایجنت دیگری برای اتصال موجود نیست."}
        </p>
      ) : (
        <Stagger initial={false} className="max-h-56 space-y-2 overflow-y-auto">
          {candidates.map((a) => {
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
                  <span className="min-w-[100px] flex-1 font-medium text-stone-800">{a.name}</span>
                  <Badge variant="muted">{KIND_LABELS[a.kind as AgentKind] ?? a.kind}</Badge>
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
      )}

      <p className="text-[11px] text-stone-500">
        {selectedCount > 0
          ? `${selectedCount} ایجنت انتخاب شده`
          : supervisorMode
            ? "حداقل یک زیرایجنت انتخاب کنید."
            : "حداقل یک ایجنت برای فراخوانی انتخاب کنید."}
      </p>
    </div>
  );
}
