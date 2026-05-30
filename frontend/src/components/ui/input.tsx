import { cn } from "@/lib/utils";

/** React DOM expects string values on controlled text/number inputs. */
function inputValue(value: string | number | readonly string[] | undefined | null) {
  if (value == null) return undefined;
  return typeof value === "number" ? String(value) : value;
}

export function Input({
  value,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "focus-ring w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm transition-colors duration-200 focus:border-brand-400",
        className
      )}
      {...props}
      value={inputValue(value)}
    />
  );
}

export function Textarea({
  value,
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "focus-ring w-full rounded-xl border border-surface-border bg-white px-4 py-2.5 text-sm transition-colors duration-200 focus:border-brand-400",
        className
      )}
      {...props}
      value={value == null ? undefined : String(value)}
    />
  );
}
