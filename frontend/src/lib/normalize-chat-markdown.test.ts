import { describe, expect, it } from "vitest";
import { normalizeChatMarkdown } from "@/lib/normalize-chat-markdown";

describe("normalizeChatMarkdown", () => {
  it("inserts space after bold label when value is glued (GFM quirk)", () => {
    const input =
      "**خلاصه:**5 رزومه بررسی شد · آستانه امتیاز: 6 · 3 نفر شورت‌لیست شدند.";
    expect(normalizeChatMarkdown(input)).toBe(
      "**خلاصه:** 5 رزومه بررسی شد · آستانه امتیاز: 6 · 3 نفر شورت‌لیست شدند."
    );
  });

  it("fixes list bold labels glued to values", () => {
    expect(normalizeChatMarkdown("- **نام:**مقدار")).toBe("- **نام**: مقدار");
  });

  it("leaves already-spaced bold labels unchanged", () => {
    const input = "**خلاصه:** 5 رزومه بررسی شد";
    expect(normalizeChatMarkdown(input)).toBe(input);
  });
});
