"use client";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { aggregateFundingByPeriod, type FundingPeriod } from "@/lib/arb";
import { formatUsd } from "@/lib/format";

interface Props {
  events: Array<{ time: number; usdc: number }>;
}

// Mirror the design tokens in globals.css so the chart matches the rest of the UI.
const C = {
  green: "#50e3c2",   // --color-hl-green
  red: "#ef4466",     // --color-hl-red
  grid: "#1e2a36",    // --color-hl-border
  axis: "#546678",    // --color-hl-text-tertiary
  tooltipBg: "#151a21", // --color-hl-bg-tertiary
  tooltipBorder: "#1e2a36",
  tooltipLabel: "#8a99a8", // --color-hl-text-secondary
};

/** Turn a bucket key ("2026-07-12 10" | "2026-07-12" | "2026-07") into a compact axis label. */
function tickLabel(key: string, period: FundingPeriod): string {
  if (period === "hour") {
    const [date, hour] = key.split(" ");
    const [, m, d] = date.split("-");
    return `${Number(m)}/${Number(d)} ${hour}시`;
  }
  if (period === "day") {
    const [, m, d] = key.split("-");
    return `${Number(m)}/${Number(d)}`;
  }
  const [y, m] = key.split("-");
  return `${y.slice(2)}/${m}`;
}

export default function FundingHistoryChart({ events }: Props) {
  const [period, setPeriod] = useState<FundingPeriod>("day");
  const buckets = useMemo(() => aggregateFundingByPeriod(events, period), [events, period]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-hl-text-tertiary">기간</span>
        {(["hour", "day", "month"] as FundingPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-2 py-0.5 rounded font-mono uppercase ${
              period === p
                ? "bg-hl-accent/20 text-hl-accent"
                : "text-hl-text-secondary hover:text-hl-text-primary"
            }`}
          >
            {p === "hour" ? "시간" : p === "day" ? "일" : "월"}
          </button>
        ))}
        <span className="ml-auto text-hl-text-tertiary">
          {buckets.length}개 구간
        </span>
      </div>

      {buckets.length === 0 ? (
        <div className="h-40 flex items-center justify-center text-xs text-hl-text-tertiary bg-hl-bg-tertiary/40 rounded">
          정산 기록 없음
        </div>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={buckets} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis
                dataKey="key"
                tick={{ fontSize: 9, fill: C.axis }}
                axisLine={{ stroke: C.grid }}
                tickLine={false}
                minTickGap={20}
                tickFormatter={(v: string) => tickLabel(v, period)}
              />
              <YAxis
                tick={{ fontSize: 9, fill: C.axis }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                cursor={{ fill: "rgba(80,227,194,0.06)" }}
                contentStyle={{
                  background: C.tooltipBg,
                  border: `1px solid ${C.tooltipBorder}`,
                  borderRadius: 6,
                  fontSize: 11,
                }}
                labelStyle={{ color: C.tooltipLabel }}
                labelFormatter={(v) => tickLabel(String(v), period)}
                formatter={(value: number | undefined) => [formatUsd(value ?? 0), "펀딩"]}
              />
              <Bar dataKey="usdc" radius={[2, 2, 0, 0]}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={b.usdc >= 0 ? C.green : C.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
