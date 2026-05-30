"use client";

import { cn } from "@/lib/utils";
import { chartSurfaceClass } from "./recharts-rtl";

type ChartBoxProps = {
  children: React.ReactNode;
  className?: string;
  height?: number | "full";
};

/** LTR coordinate space + overflow clip so pie/bar segments stay inside the card. */
export function ChartBox({ children, className, height = "full" }: ChartBoxProps) {
  return (
    <div
      dir="ltr"
      className={cn(
        chartSurfaceClass,
        height === "full" ? "h-full min-h-[12rem]" : undefined,
        className
      )}
      style={typeof height === "number" ? { height } : undefined}
    >
      {children}
    </div>
  );
}
