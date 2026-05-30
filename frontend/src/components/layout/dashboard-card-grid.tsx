import { Children, isValidElement } from "react";
import { cn } from "@/lib/utils";

/** RTL-aware slots: "right"/"left" map to the first/second desktop column. */
export type DashboardGridSlot = "topRight" | "topLeft" | "bottomRight" | "bottomLeft";

const RIGHT_SLOTS: DashboardGridSlot[] = ["topRight", "bottomRight"];
const LEFT_SLOTS: DashboardGridSlot[] = ["topLeft", "bottomLeft"];

/**
 * 2-column dashboard layout. Each column is an independent vertical stack so a
 * short card (e.g. a chart) sits flush above the next card instead of leaving a
 * gap dictated by the taller card in the adjacent column.
 *
 * On desktop (md+): right column = topRight→bottomRight, left = topLeft→bottomLeft.
 * On mobile: columns stack (right column first, then left).
 */
export function DashboardFourCardGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const items = Children.toArray(children).filter(
    isValidElement
  ) as React.ReactElement<{ slot?: DashboardGridSlot }>[];

  const pick = (slots: DashboardGridSlot[]) =>
    slots
      .map((slot) => items.find((child) => child.props.slot === slot))
      .filter(Boolean);

  const right = pick(RIGHT_SLOTS);
  const left = pick(LEFT_SLOTS);

  return (
    <section
      className={cn(
        "flex flex-col gap-6 md:flex-row md:items-start",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-6">{right}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-6">{left}</div>
    </section>
  );
}

/** Cell inside DashboardFourCardGrid (or legacy two-col rows). */
export function DashboardCol({
  children,
  className,
  slot,
}: {
  children: React.ReactNode;
  className?: string;
  slot?: DashboardGridSlot;
}) {
  void slot;
  return (
    <div className={cn("min-w-0 w-full self-start", className)}>{children}</div>
  );
}

/**
 * @deprecated Prefer DashboardFourCardGrid + slot for 2×2 admin-style layouts.
 */
export function DashboardTwoColRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-6 lg:flex-row lg:items-start",
        className
      )}
    >
      {children}
    </div>
  );
}
