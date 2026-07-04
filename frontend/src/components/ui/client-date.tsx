"use client";

import { useEffect, useState } from "react";
import {
  formatPersianDate,
  PERSIAN_WEEKDAY_DATE_OPTS,
  withPersianCalendar,
} from "@/lib/persian-date";

type Props = {
  options?: Intl.DateTimeFormatOptions;
  className?: string;
};

/** Renders fa-IR dates only after mount to avoid SSR/client hydration mismatches. */
export function ClientDate({ options = PERSIAN_WEEKDAY_DATE_OPTS, className }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatPersianDate(new Date(), options));
  }, [options]);

  if (!label) {
    return (
      <time className={className} suppressHydrationWarning>
        …
      </time>
    );
  }

  return (
    <time className={className} dateTime={new Date().toISOString()} suppressHydrationWarning>
      {label}
    </time>
  );
}

/** Month + Jalali year after mount (login hero, footers). */
export function ClientMonthYear({ className }: { className?: string }) {
  return <ClientDate options={withPersianCalendar({ month: "long", year: "numeric" })} className={className} />;
}

/** fa-IR date+time after mount (notifications, admin events, etc.). */
export function ClientDateTime({
  iso,
  className,
}: {
  iso: string;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatPersianDate(new Date(iso), withPersianCalendar({
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })));
  }, [iso]);

  return (
    <span className={className} suppressHydrationWarning>
      {label ?? "…"}
    </span>
  );
}

/** fa-IR number formatting after mount. */
export function ClientNumber({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(value.toLocaleString("fa-IR"));
  }, [value]);

  return (
    <span className={className} suppressHydrationWarning>
      {label ?? String(value)}
    </span>
  );
}
