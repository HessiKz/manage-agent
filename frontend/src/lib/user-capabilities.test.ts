import { describe, expect, it } from "vitest";
import {
  CAPABILITY_DENIAL_FA,
  capabilityForScript,
  checkUiAutomationPermission,
  deriveUserCapabilities,
  humanizeCapabilityDenial,
  pathRequiresSuperuser,
  scriptRequiresSuperuser,
} from "@/lib/user-capabilities";
import type { SupportUiScript } from "@/lib/support-ui-script";

describe("deriveUserCapabilities", () => {
  it("grants admin paths only to superusers", () => {
    const user = deriveUserCapabilities({ is_superuser: false });
    const admin = deriveUserCapabilities({ is_superuser: true });
    expect(user.canCreateAgent).toBe(false);
    expect(admin.canCreateAgent).toBe(true);
    expect(user.allowedPaths).not.toContain("/agents/create");
    expect(admin.allowedPaths).toContain("/users");
  });
});

describe("pathRequiresSuperuser", () => {
  it("flags agent wizard and admin surfaces", () => {
    expect(pathRequiresSuperuser("/agents/create")).toBe(true);
    expect(pathRequiresSuperuser("/agents/create/testing?slug=x")).toBe(true);
    expect(pathRequiresSuperuser("/users")).toBe(true);
    expect(pathRequiresSuperuser("/admin")).toBe(true);
    expect(pathRequiresSuperuser("/dashboard")).toBe(false);
  });
});

describe("checkUiAutomationPermission", () => {
  const user = deriveUserCapabilities({ is_superuser: false });
  const admin = deriveUserCapabilities({ is_superuser: true });

  it("denies non-admin wizard automation with actionable copy", () => {
    const script: SupportUiScript = {
      label: "ساخت ایجنت",
      steps: [{ type: "navigate", path: "/agents/create" }],
    };
    expect(capabilityForScript(script, undefined)).toBe("create_agent");
    expect(checkUiAutomationPermission(user, script, undefined)).toBe(
      CAPABILITY_DENIAL_FA.create_agent
    );
    expect(checkUiAutomationPermission(admin, script, undefined)).toBeNull();
  });

  it("allows knowledge navigation for regular users", () => {
    const script: SupportUiScript = {
      label: "دانش",
      steps: [{ type: "navigate", path: "/knowledge" }],
    };
    expect(scriptRequiresSuperuser(script)).toBe(false);
    expect(checkUiAutomationPermission(user, script, undefined)).toBeNull();
  });
});

describe("humanizeCapabilityDenial", () => {
  it("maps capability codes to Persian", () => {
    expect(humanizeCapabilityDenial("create_agent")).toContain("ادمین");
  });
});
