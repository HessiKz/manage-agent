/** Persian (Jalali) dates via Intl — CLDR / browser locale data (fa-IR + persian calendar). */

const PERSIAN_LOCALE = "fa-IR";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function withPersianCalendar(
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormatOptions {
  return { calendar: "persian", ...options };
}

export function formatPersianDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat(PERSIAN_LOCALE, withPersianCalendar(options)).format(date);
}

/** e.g. «خرداد ۱۴۰۵» */
export function formatPersianMonthYear(date: Date = new Date()): string {
  return formatPersianDate(date, { month: "long", year: "numeric" });
}

/** e.g. «۱۴۰۵/۰۳» */
export function formatPersianYearMonthNumeric(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat(PERSIAN_LOCALE, withPersianCalendar({
    year: "numeric",
    month: "2-digit",
  })).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  return `${year}/${month}`;
}

export function persianDigitsToLatin(value: string): string {
  return value.replace(/[۰-۹]/g, (ch) => String(PERSIAN_DIGITS.indexOf(ch)));
}

export function currentJalaliYear(date: Date = new Date()): number {
  const year = new Intl.DateTimeFormat(PERSIAN_LOCALE, withPersianCalendar({
    year: "numeric",
  }))
    .formatToParts(date)
    .find((p) => p.type === "year")?.value;
  return Number(persianDigitsToLatin(year ?? "1400"));
}

export const PERSIAN_WEEKDAY_DATE_OPTS: Intl.DateTimeFormatOptions = withPersianCalendar({
  weekday: "long",
  month: "long",
  day: "numeric",
});

export const PERSIAN_MONTH_YEAR_OPTS: Intl.DateTimeFormatOptions = withPersianCalendar({
  month: "long",
  year: "numeric",
});
