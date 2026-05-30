"use client";

import type { ReactNode } from "react";

type Props = {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
};

export function WizardField({ label, hint, htmlFor, children }: Props) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-stone-800">
        {label}
      </label>
      {hint && <p className="text-xs leading-relaxed text-stone-500">{hint}</p>}
      {children}
    </div>
  );
}
