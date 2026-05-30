import type { CSSProperties } from "react";

/** Recharts SVG layout is LTR; isolate charts from page RTL while keeping Persian labels. */
export const chartSurfaceClass = "h-full w-full min-w-0 overflow-hidden";

export const chartTick = {
  fill: "#78716c",
  fontSize: 11,
  fontFamily: "Vazirmatn, system-ui, sans-serif",
};

export const lineChartMargin = { top: 36, right: 12, left: 12, bottom: 8 };
export const barChartMargin = { top: 8, right: 8, left: 4, bottom: 4 };
export const pieChartMargin = { top: 8, right: 8, bottom: 48, left: 8 };

export const legendBottom = {
  verticalAlign: "bottom" as const,
  align: "center" as const,
  layout: "horizontal" as const,
  iconType: "circle" as const,
  iconSize: 8,
  height: 40,
  wrapperStyle: {
    direction: "rtl",
    textAlign: "center",
    fontSize: 11,
    lineHeight: "1.4",
    paddingTop: 8,
    width: "100%",
  } satisfies CSSProperties,
};

export const legendTop = {
  verticalAlign: "top" as const,
  align: "center" as const,
  layout: "horizontal" as const,
  iconType: "circle" as const,
  iconSize: 8,
  height: 32,
  wrapperStyle: {
    direction: "rtl",
    textAlign: "center",
    fontSize: 11,
    paddingBottom: 4,
    width: "100%",
  } satisfies CSSProperties,
};

export const tooltipContentStyle: CSSProperties = {
  direction: "rtl",
  textAlign: "right",
  borderRadius: 8,
  border: "1px solid #e8e0d8",
  fontSize: 12,
  fontFamily: "Vazirmatn, system-ui, sans-serif",
  boxShadow: "0 4px 12px rgba(28, 25, 23, 0.08)",
};

/** Short tick labels (e.g. dates) */
export const axisX = {
  tick: chartTick,
  tickMargin: 8,
  height: 32,
  axisLine: false,
  tickLine: false,
};

/** Long Persian month names on line charts */
export const axisXMonth = {
  ...axisX,
  height: 44,
  interval: 0 as const,
  angle: -18,
  textAnchor: "end" as const,
  dy: 4,
};

export const axisY = {
  orientation: "right" as const,
  tick: chartTick,
  tickMargin: 6,
  width: 40,
  axisLine: false,
  tickLine: false,
};

/** Donut — large but stays inside card (legend at bottom). */
export const pieGeometry = {
  cx: "50%",
  cy: "47%",
  innerRadius: "52%",
  outerRadius: "74%",
  paddingAngle: 2,
};
