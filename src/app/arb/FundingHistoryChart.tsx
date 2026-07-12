"use client";
import { useMemo, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { aggregateFundingByPeriod, type FundingPeriod } from "@/lib/arb";
import { formatUsd } from "@/lib/format";

interface Props {
  events: Array<{ time: number; usdc: number }>;
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
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2f3a" vertical={false} />
              <XAxis
                dataKey="key"
                tick={{ fontSize: 9, fill: "#7f8894" }}
                axisLine={{ stroke: "#2a2f3a" }}
                tickLine={false}
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#7f8894" }}
                axisLine={false}
                tickLine={false}
                width={40}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                contentStyle={{
                  background: "#141821",
                  border: "1px solid #2a2f3a",
                  borderRadius: 6,
                  fontSize: 11,
                }}
                labelStyle={{ color: "#c8d0d8" }}
                formatter={(value: number | undefined) => [formatUsd(value ?? 0), "펀딩"]}
              />
              <Bar dataKey="usdc" radius={[2, 2, 0, 0]}>
                {buckets.map((b, i) => (
                  <Cell key={i} fill={b.usdc >= 0 ? "#5cffb8" : "#ff5c7c"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
