"use client";

import { useEffect, useState } from "react";

const DEFAULT_DATE_OPTS: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
};

type Props = {
  options?: Intl.DateTimeFormatOptions;
  className?: string;
};

/** Renders fa-IR dates only after mount to avoid SSR/client hydration mismatches. */
export function ClientDate({ options = DEFAULT_DATE_OPTS, className }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(new Date().toLocaleDateString("fa-IR", options));
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
    setLabel(new Date(iso).toLocaleString("fa-IR"));
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
