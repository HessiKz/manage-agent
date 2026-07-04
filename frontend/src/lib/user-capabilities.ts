/** Permission parity between support UI automation and backend admin gates. */

import type { SupportUiAction } from "@/lib/page-guide-context";
import type { SupportUiScript } from "@/lib/support-ui-script";

export type PlatformCapability =
  | "create_agent"
  | "manage_users"
  | "access_admin"
  | "execute_admin_ui";

export type UserCapabilities = {
  isSuperuser: boolean;
  canCreateAgent: boolean;
  canManageUsers: boolean;
  canAccessAdmin: boolean;
  canAccessKnowledgeAdmin: boolean;
  allowedPaths: string[];
};

export const ADMIN_ONLY_PATH_PREFIXES = ["/agents/create", "/users", "/admin"] as const;

export const CAPABILITY_DENIAL_FA: Record<PlatformCapability, string> = {
  create_agent:
    "ساخت ایجنت فقط برای ادمین پلتفرم مجاز است — از نوار کنار به «نمای ادمین» بروید یا از مدیر سیستم بخواهید.",
  manage_users: "مدیریت کاربران فقط برای ادمین است — از مدیر سیستم بخواهید.",
  access_admin: "پنل ادمین فقط برای ادمین در دسترس است.",
  execute_admin_ui:
    "این کار در رابط فقط برای ادمین مجاز است — نقش خود را بررسی کنید یا از مدیر سیستم کمک بگیرید.",
};

const USER_ALLOWED_PATHS = [
  "/dashboard",
  "/agents",
  "/knowledge",
  "/settings",
  "/integrations",
  "/conversations",
] as const;

const ADMIN_ALLOWED_PATHS = [
  ...USER_ALLOWED_PATHS,
  "/agents/create",
  "/users",
  "/admin",
] as const;

export function deriveUserCapabilities(
  user: { is_superuser?: boolean } | null | undefined
): UserCapabilities {
  const isSuperuser = Boolean(user?.is_superuser);
  return {
    isSuperuser,
    canCreateAgent: isSuperuser,
    canManageUsers: isSuperuser,
    canAccessAdmin: isSuperuser,
    canAccessKnowledgeAdmin: isSuperuser,
    allowedPaths: [...(isSuperuser ? ADMIN_ALLOWED_PATHS : USER_ALLOWED_PATHS)],
  };
}

export function pathRequiresSuperuser(path: string): boolean {
  const normalized = (path || "").split("?")[0];
  return ADMIN_ONLY_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function scriptRequiresSuperuser(script: SupportUiScript): boolean {
  for (const step of script.steps) {
    if (step.type === "navigate" && pathRequiresSuperuser(step.path)) return true;
    if (step.type === "bridge" && step.action.startsWith("wizard.")) return true;
  }
  return false;
}

export function actionRequiresSuperuser(action: SupportUiAction | undefined): boolean {
  if (!action) return false;
  if (action.type === "navigate" && action.path && pathRequiresSuperuser(action.path)) {
    return true;
  }
  return false;
}

export function capabilityForScript(
  script: SupportUiScript | undefined,
  uiAction: SupportUiAction | undefined
): PlatformCapability | null {
  if (script?.steps.some((s) => s.type === "bridge" && s.action.startsWith("wizard."))) {
    return "create_agent";
  }
  const paths: string[] = [];
  if (script) {
    for (const step of script.steps) {
      if (step.type === "navigate") paths.push(step.path);
    }
  }
  if (uiAction?.type === "navigate" && uiAction.path) paths.push(uiAction.path);
  if (paths.some((p) => p.startsWith("/users"))) return "manage_users";
  if (paths.some((p) => p.startsWith("/admin"))) return "access_admin";
  if (paths.some((p) => pathRequiresSuperuser(p))) return "create_agent";
  return null;
}

/** Returns a Persian denial message, or null when allowed. */
export function checkUiAutomationPermission(
  caps: UserCapabilities,
  script: SupportUiScript | undefined,
  uiAction: SupportUiAction | undefined
): string | null {
  if (caps.isSuperuser) return null;
  const cap = capabilityForScript(script, uiAction);
  if (cap) return CAPABILITY_DENIAL_FA[cap];
  if (script && scriptRequiresSuperuser(script)) return CAPABILITY_DENIAL_FA.execute_admin_ui;
  if (actionRequiresSuperuser(uiAction)) return CAPABILITY_DENIAL_FA.execute_admin_ui;
  return null;
}

export function formatCapabilitiesForAgent(caps: UserCapabilities): string {
  const lines = [
    `create_agent: ${caps.canCreateAgent}`,
    `manage_users: ${caps.canManageUsers}`,
    `access_admin: ${caps.canAccessAdmin}`,
    `allowed_paths: ${caps.allowedPaths.join(", ")}`,
  ];
  if (caps.isSuperuser) {
    return `ادمین — ${lines.join(" · ")}`;
  }
  return `کاربر عادی — ${lines.join(" · ")} — بدون ساخت ایجنت یا مدیریت کاربران`;
}

export function humanizeCapabilityDenial(
  capability?: string | null,
  fallback?: string
): string {
  if (capability && capability in CAPABILITY_DENIAL_FA) {
    return CAPABILITY_DENIAL_FA[capability as PlatformCapability];
  }
  return fallback ?? CAPABILITY_DENIAL_FA.execute_admin_ui;
}
