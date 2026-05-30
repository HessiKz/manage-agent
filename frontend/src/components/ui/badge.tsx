import { cn } from "@/lib/utils";

export function Badge({
  children,
  variant = "default",
  className,
  dir,
}: {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "muted" | "risk";
  className?: string;
  /** Use "ltr" for values with + / % / digits in RTL pages */
  dir?: "ltr" | "rtl" | "auto";
}) {
  const variants = {
    default: "bg-brand-50 text-brand-700",
    success: "bg-[#e4f2eb] text-accent-green",
    warning: "bg-brand-100 text-brand-700",
    danger: "bg-[#f5e0e0] text-accent-red",
    risk: "bg-[#f0d4d4] text-accent-red",
    muted: "bg-stone-100 text-stone-600",
  };
  return (
    <span
      dir={dir}
      className={cn(
        "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium leading-none",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
