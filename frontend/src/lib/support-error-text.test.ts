import { describe, expect, it } from "vitest";
import { SupportUiBlockedError } from "@/lib/support-abort";
import { humanizeSupportError, humanizeToolStatus } from "@/lib/support-error-text";

describe("humanizeSupportError", () => {
  it("maps UUID parse errors to Persian", () => {
    expect(
      humanizeSupportError(new Error("badly formed hexadecimal UUID string"))
    ).toBe("شناسهٔ ایجنت نامعتبر است — لطفاً دوباره تلاش کنید.");
  });

  it("uses blocker text for SupportUiBlockedError", () => {
    expect(
      humanizeSupportError(new SupportUiBlockedError("نام ایجنت تکراری است"))
    ).toBe("نام ایجنت تکراری است");
  });

  it("maps generic English errors to Persian", () => {
    expect(humanizeSupportError(new Error("Internal Server Error"))).toBe(
      "خطایی رخ داد — لطفاً دوباره تلاش کنید."
    );
  });

  it("does not map wizard agent-grant errors to admin denial", () => {
    expect(
      humanizeSupportError(
        new Error("قبل از شروع تست باید دسترسی پیش‌فرض یا یک کاربر انتخاب شود.")
      )
    ).toBe("قبل از شروع تست باید دسترسی پیش‌فرض یا یک کاربر انتخاب شود.");
  });

  it("maps agent runtime permission denied separately from admin 403", () => {
    expect(humanizeSupportError(new Error("Permission denied to call agent 'foo'."))).toBe(
      "ایجنت اجازه فراخوانی زیرایجنت را ندارد — دسترسی‌ها را در تنظیمات بررسی کنید."
    );
    expect(humanizeSupportError(new Error("permission denied"))).toBe(
      "اجرای ابزار توسط ایجنت مجاز نبود — دستورالعمل یا دسترسی ابزار را بررسی کنید."
    );
  });

  it("maps superuser API denial to admin message", () => {
    expect(humanizeSupportError(new Error("Superuser privileges required"))).toBe(
      "ساخت ایجنت فقط برای ادمین پلتفرم مجاز است — از نوار کنار به «نمای ادمین» بروید یا از مدیر سیستم بخواهید."
    );
  });

  it("maps revoked LLM gateway token to actionable Persian", () => {
    expect(
      humanizeSupportError(
        new Error("Error code: 401 - invalid token (request id: abc)")
      )
    ).toBe(
      "کلید API مدل زبانی نامعتبر یا منقضی است — در ادمین → ارائه‌دهنده مدل، OPENAI_API_KEY را در backend/.env به‌روز کنید یا به cursor-to-api تغییر دهید."
    );
  });
});

describe("humanizeToolStatus", () => {
  it("maps platform tool names to Persian", () => {
    expect(humanizeToolStatus("platform_create_agent")).toBe(
      "در حال ساخت ایجنت از طریق ویزارد…"
    );
  });
});
