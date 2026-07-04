import type { AgentCapabilities, AgentKind } from "@/types";

export type CapabilityKey = keyof AgentCapabilities;

export type CapabilityRule = {
  /** User may toggle when not locked. */
  allowed: boolean;
  /** Fixed value — checkbox disabled. */
  locked: boolean;
  forcedValue?: boolean;
  lockReason?: string;
};

const LOCK = (forcedValue: boolean, lockReason: string): CapabilityRule => ({
  allowed: false,
  locked: true,
  forcedValue,
  lockReason,
});

const FREE: CapabilityRule = { allowed: true, locked: false };

/** Per-kind capability constraints — irrelevant options stay locked off. */
export const CAPABILITY_RULES: Record<AgentKind, Record<CapabilityKey, CapabilityRule>> = {
  chat: {
    chat_enabled: FREE,
    file_upload_enabled: FREE,
    actions_enabled: FREE,
    templates_enabled: FREE,
    can_call_agents: FREE,
    supervisor_enabled: LOCK(
      false,
      "فقط نوع «سرپرست» می‌تواند مسیریابی زیرایجنت داشته باشد."
    ),
    external_apis_enabled: FREE,
  },
  worker: {
    chat_enabled: LOCK(
      false,
      "کارگر بدون گفت‌وگو اجرا می‌شود — از نوع «گفت‌وگو» یا «سفارشی» استفاده کنید."
    ),
    file_upload_enabled: FREE,
    actions_enabled: FREE,
    templates_enabled: LOCK(false, "قالب پرامپت برای کارگر فعال نیست."),
    can_call_agents: LOCK(
      false,
      "کارگر مستقیماً ایجنت دیگر را فراخوانی نمی‌کند — از نوع «سرپرست» یا «سفارشی» استفاده کنید."
    ),
    supervisor_enabled: LOCK(
      false,
      "کارگر نمی‌تواند سرپرست باشد — نوع «سرپرست» را انتخاب کنید."
    ),
    external_apis_enabled: FREE,
  },
  supervisor: {
    chat_enabled: LOCK(true, "سرپرست باید گفت‌وگو داشته باشد تا درخواست را بگیرد و مسیریابی کند."),
    file_upload_enabled: FREE,
    actions_enabled: LOCK(
      false,
      "سرپرست اقدام مستقیم اجرا نمی‌کند — درخواست را به زیرایجنت‌ها می‌فرستد."
    ),
    templates_enabled: LOCK(false, "قالب پرامپت برای سرپرست فعال نیست."),
    can_call_agents: LOCK(
      false,
      "سرپرست با «زیرایجنت» کار می‌کند، نه فراخوانی ابزاری ایجنت."
    ),
    supervisor_enabled: LOCK(true, "این توانایی برای نوع سرپرست همیشه فعال است."),
    external_apis_enabled: FREE,
  },
  custom: {
    chat_enabled: FREE,
    file_upload_enabled: FREE,
    actions_enabled: FREE,
    templates_enabled: FREE,
    can_call_agents: FREE,
    supervisor_enabled: LOCK(
      false,
      "مسیریابی سرپرست فقط در نوع «سرپرست» — نه سفارشی."
    ),
    external_apis_enabled: FREE,
  },
};

export function getCapabilityRule(kind: AgentKind, key: CapabilityKey): CapabilityRule {
  return CAPABILITY_RULES[kind][key];
}

export function clampCapabilitiesForKind(
  kind: AgentKind,
  caps: AgentCapabilities
): AgentCapabilities {
  const out = { ...caps };
  for (const key of Object.keys(CAPABILITY_RULES[kind]) as CapabilityKey[]) {
    const rule = CAPABILITY_RULES[kind][key];
    if (rule.locked && rule.forcedValue !== undefined) {
      out[key] = rule.forcedValue;
    } else if (!rule.allowed && rule.forcedValue !== undefined) {
      out[key] = rule.forcedValue;
    }
  }
  if (out.supervisor_enabled && out.can_call_agents) {
    out.can_call_agents = false;
  }
  return out;
}

export function shouldShowAgentLinks(kind: AgentKind, caps: AgentCapabilities): boolean {
  const clamped = clampCapabilitiesForKind(kind, caps);
  return kind === "supervisor" || Boolean(clamped.can_call_agents);
}

export function agentLinksRequired(kind: AgentKind, caps: AgentCapabilities): boolean {
  return shouldShowAgentLinks(kind, caps);
}
