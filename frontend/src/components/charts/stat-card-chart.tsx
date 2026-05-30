"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
} from "recharts";

export type StatCardChartVariant =
  | "savings"
  | "hours"
  | "alerts"
  | "accuracy"
  | "payroll-headcount"
  | "payroll-payout"
  | "payroll-review"
  | "payroll-tax";

type Point = { v: number };

type Preset = {
  data: Point[];
  kind: "area" | "bar" | "line";
  stroke: string;
  fill: string;
};

const PRESETS: Record<StatCardChartVariant, Preset> = {
  savings: {
    data: [{ v: 72 }, { v: 88 }, { v: 82 }, { v: 96 }, { v: 104 }, { v: 118 }, { v: 124 }],
    kind: "area",
    stroke: "#188858",
    fill: "#188858",
  },
  hours: {
    data: [{ v: 52 }, { v: 58 }, { v: 61 }, { v: 68 }, { v: 74 }, { v: 79 }, { v: 84 }],
    kind: "area",
    stroke: "#b86828",
    fill: "#b86828",
  },
  alerts: {
    data: [{ v: 5 }, { v: 4 }, { v: 6 }, { v: 3 }, { v: 4 }, { v: 2 }, { v: 3 }],
    kind: "bar",
    stroke: "#b03838",
    fill: "#e8a0a0",
  },
  accuracy: {
    data: [{ v: 96.2 }, { v: 96.8 }, { v: 97.1 }, { v: 97.4 }, { v: 97.8 }, { v: 98 }, { v: 98.2 }],
    kind: "line",
    stroke: "#2868a0",
    fill: "#2868a0",
  },
  "payroll-headcount": {
    data: [{ v: 132 }, { v: 136 }, { v: 140 }, { v: 142 }, { v: 145 }, { v: 147 }, { v: 148 }],
    kind: "area",
    stroke: "#7858a0",
    fill: "#7858a0",
  },
  "payroll-payout": {
    data: [{ v: 7.2 }, { v: 7.4 }, { v: 7.5 }, { v: 7.6 }, { v: 7.9 }, { v: 8 }, { v: 8.2 }],
    kind: "area",
    stroke: "#b86828",
    fill: "#b86828",
  },
  "payroll-review": {
    data: [{ v: 7 }, { v: 5 }, { v: 6 }, { v: 4 }, { v: 5 }, { v: 3 }, { v: 3 }],
    kind: "bar",
    stroke: "#c05878",
    fill: "#e8b0c0",
  },
  "payroll-tax": {
    data: [{ v: 880 }, { v: 910 }, { v: 920 }, { v: 940 }, { v: 955 }, { v: 968 }, { v: 980 }],
    kind: "line",
    stroke: "#188858",
    fill: "#188858",
  },
};

function MiniArea({ preset }: { preset: Preset }) {
  const id = `stat-fill-${preset.stroke.replace("#", "")}`;
  return (
    <AreaChart data={preset.data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={preset.fill} stopOpacity={0.35} />
          <stop offset="100%" stopColor={preset.fill} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <Area
        type="monotone"
        dataKey="v"
        stroke={preset.stroke}
        strokeWidth={2}
        fill={`url(#${id})`}
        dot={false}
        isAnimationActive={false}
      />
    </AreaChart>
  );
}

function MiniBar({ preset }: { preset: Preset }) {
  return (
    <BarChart data={preset.data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
      <Bar dataKey="v" fill={preset.fill} stroke={preset.stroke} strokeWidth={1} radius={[3, 3, 0, 0]} />
    </BarChart>
  );
}

function MiniLine({ preset }: { preset: Preset }) {
  return (
    <LineChart data={preset.data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
      <Line
        type="monotone"
        dataKey="v"
        stroke={preset.stroke}
        strokeWidth={2}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

export function StatCardChart({ variant }: { variant: StatCardChartVariant }) {
  const preset = PRESETS[variant];
  return (
    <div className="h-14 w-[5.5rem] shrink-0 opacity-90" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        {preset.kind === "area" ? (
          <MiniArea preset={preset} />
        ) : preset.kind === "bar" ? (
          <MiniBar preset={preset} />
        ) : (
          <MiniLine preset={preset} />
        )}
      </ResponsiveContainer>
    </div>
  );
}
