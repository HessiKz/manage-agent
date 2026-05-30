import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    ghost:
      "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors duration-200 hover:bg-brand-50 hover:text-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
    danger:
      "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent-red px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors duration-200 hover:bg-accent-red/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-red/50 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  };
  return <button className={cn(variants[variant], className)} {...props} />;
}
