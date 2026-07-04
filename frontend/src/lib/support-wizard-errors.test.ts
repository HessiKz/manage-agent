import { describe, expect, it } from "vitest";
import { isPublishRetryableError } from "@/lib/support-wizard-errors";

describe("isPublishRetryableError", () => {
  it("allows duplicate name errors", () => {
    expect(isPublishRetryableError("نام تکراری است")).toBe(true);
    expect(isPublishRetryableError("already exists")).toBe(true);
  });

  it("treats wizard grant errors as retryable and admin denial as not", () => {
    expect(
      isPublishRetryableError(
        "حداقل یک کاربر را انتخاب کنید، یا گزینه «دسترسی پیش‌فرض سازمان» را تأیید کنید."
      )
    ).toBe(true);
    expect(isPublishRetryableError("دسترسی به این بخش مجاز نیست")).toBe(false);
    expect(isPublishRetryableError("HTTP 403")).toBe(false);
  });
});
