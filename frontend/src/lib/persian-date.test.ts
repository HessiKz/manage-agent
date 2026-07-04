import { describe, expect, it } from "vitest";
import {
  currentJalaliYear,
  formatPersianMonthYear,
  formatPersianYearMonthNumeric,
  persianDigitsToLatin,
} from "@/lib/persian-date";

describe("persian-date", () => {
  const khordad1405 = new Date("2026-06-16T12:00:00Z");

  it("formats month and year in Jalali calendar", () => {
    const label = formatPersianMonthYear(khordad1405);
    expect(label).toContain("خرداد");
    expect(label).toContain("۱۴۰۵");
  });

  it("formats numeric year/month", () => {
    expect(formatPersianYearMonthNumeric(khordad1405)).toBe("۱۴۰۵/۰۳");
  });

  it("parses Jalali year", () => {
    expect(currentJalaliYear(khordad1405)).toBe(1405);
  });

  it("converts Persian digits", () => {
    expect(persianDigitsToLatin("۱۴۰۵")).toBe("1405");
  });
});
