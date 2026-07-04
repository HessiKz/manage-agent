import { describe, expect, it } from "vitest";
import { readSupportWizardAgentName } from "@/lib/support-wizard-field-heal";

describe("support-wizard-field-heal", () => {
  it("falls back to default agent name when storage is empty", () => {
    expect(readSupportWizardAgentName()).toBe("ایجنت جدید");
  });
});
