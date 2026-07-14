import { describe, expect, it } from "vitest";
import { formatAssistantOutput, sanitizeChatMessage } from "./sanitize-chat-message";

const SAMPLE = `می‌تونیم یک پاسخ حرفه‌ای آماده کنیم:

:::writing
سلام جناب کاظمی،

در خصوص درخواست ثبت‌شده، بررسی‌های لازم انجام شد.
:::

اگر بگی موضوع تیکت چی بوده (TK-501)، شخصی‌سازی می‌کنم.`;

describe("sanitizeChatMessage", () => {
  it("extracts :::writing body and drops meta for assistant", () => {
    const out = sanitizeChatMessage(SAMPLE, "assistant");
    expect(out).not.toContain(":::writing");
    expect(out).not.toContain("می‌تونیم");
    expect(out).not.toContain("TK-501");
    expect(out).toContain("سلام جناب کاظمی");
  });

  it("does not alter user messages", () => {
    expect(sanitizeChatMessage(":::writing\nhi\n:::", "user")).toBe(
      ":::writing\nhi\n:::"
    );
  });

  it("uses fallback when sanitized empty", () => {
    const out = formatAssistantOutput("   ");
    expect(out.length).toBeGreaterThan(10);
  });

  it("strips MIX gateway routing tags", () => {
    const out = sanitizeChatMessage(
      "[MIX → se/pie/grok-4.5] سلام، وضعیت سیستم عادی است.",
      "assistant"
    );
    expect(out).not.toContain("MIX");
    expect(out).not.toMatch(/grok/i);
    expect(out).toContain("سلام");
  });

  it("strips repeated MIX tags mid-text", () => {
    const out = sanitizeChatMessage(
      "[MIX → se/pie/grok-4.5]\nخط اول\n[MIX → other/model] خط دوم",
      "assistant"
    );
    expect(out).not.toContain("MIX");
    expect(out).toContain("خط اول");
    expect(out).toContain("خط دوم");
  });
});
