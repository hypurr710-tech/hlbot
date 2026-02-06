"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  getPortfolioHistory,
  PortfolioPeriodData,
  PortfolioTimeRange,
} from "@/lib/hyperliquid";

interface PortfolioChartProps {
  addresses: { address: string; label: string }[];
}

interface ChartDataPoint {
  time: number;
  value: number;
}

const TIME_RANGES: { key: PortfolioTimeRange; label: string }[] = [
  { key: "day", label: "24H" },
  { key: "week", label: "7D" },
  { key: "month", label: "30D" },
  { key: "allTime", label: "ALL" },
];

const REFRESH_INTERVAL = 30_000;

function formatChartTime(timestamp: number, range: PortfolioTimeRange): string {
  const d = new Date(timestamp);
  if (range === "day") {
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  if (range === "week") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTooltipValue(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function mergeHistories(
  histories: PortfolioPeriodData[],
  range: PortfolioTimeRange
): ChartDataPoint[] {
  if (histories.length === 0) return [];
  if (histories.length === 1) {
    return histories[0].accountValueHistory.map(([time, val]) => ({
      time,
      value: parseFloat(val),
    }));
  }

  // Collect all unique timestamps across addresses
  const timeMap = new Map<number, number>();
  for (const h of histories) {
    for (const [time, val] of h.accountValueHistory) {
      timeMap.set(time, (timeMap.get(time) || 0) + parseFloat(val));
    }
  }

  // If timestamps don't perfectly align, interpolate by bucketing
  // For multiple addresses with different sample times, group into time buckets
  const allPoints = histories.flatMap((h, idx) =>
    h.accountValueHistory.map(
      ([time, val]) => ({ time, value: parseFloat(val), addr: idx } as const)
    )
  );
  allPoints.sort((a, b) => a.time - b.time);

  if (allPoints.length === 0) return [];

  // Determine bucket size based on range
  const bucketMs =
    range === "day"
      ? 5 * 60_000 // 5 min
      : range === "week"
      ? 30 * 60_000 // 30 min
      : range === "month"
      ? 4 * 3600_000 // 4 hours
      : 24 * 3600_000; // 1 day

  const addrCount = histories.length;
  const latestValues = new Array(addrCount).fill(0);
  const merged: ChartDataPoint[] = [];

  let bucketStart = allPoints[0].time;
  let i = 0;

  while (i < allPoints.length) {
    const bucketEnd = bucketStart + bucketMs;

    // Process all points in this bucket
    while (i < allPoints.length && allPoints[i].time < bucketEnd) {
      latestValues[allPoints[i].addr] = allPoints[i].value;
      i++;
    }

    const total = latestValues.reduce((s, v) => s + v, 0);
    merged.push({ time: bucketStart, value: total });
    bucketStart = bucketEnd;
  }

  return merged;
}

export default function PortfolioChart({ addresses }: PortfolioChartProps) {
  const [range, setRange] = useState<PortfolioTimeRange>("day");
  const [historyByAddr, setHistoryByAddr] = useState<
    Record<string, Record<string, PortfolioPeriodData>>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (addresses.length === 0) {
      setHistoryByAddr({});
      setLoading(false);
      return;
    }
    try {
      const results = await Promise.allSettled(
        addresses.map(async (a) => ({
          address: a.address,
          data: await getPortfolioHistory(a.address),
        }))
      );
      const newHistory: Record<
        string,
        Record<string, PortfolioPeriodData>
      > = {};
      for (const r of results) {
        if (r.status === "fulfilled") {
          newHistory[r.value.address] = r.value.data;
        }
      }
      setHistoryByAddr(newHistory);
      setError(null);
    } catch {
      setError("Failed to load portfolio history");
    }
    setLoading(false);
  }, [addresses]);

  useEffect(() => {
    setLoading(true);
    fetchHistory();
    const interval = setInterval(fetchHistory, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const chartData = useMemo(() => {
    const periodDataList: PortfolioPeriodData[] = [];
    for (const addrData of Object.values(historyByAddr)) {
      if (addrData[range]) {
        periodDataList.push(addrData[range]);
      }
    }
    return mergeHistories(periodDataList, range);
  }, [historyByAddr, range]);

  const { currentValue, changeValue, changePercent, isPositive } =
    useMemo(() => {
      if (chartData.length < 2) {
        return {
          currentValue: chartData.length === 1 ? chartData[0].value : 0,
          changeValue: 0,
          changePercent: 0,
          isPositive: true,
        };
      }
      const first = chartData[0].value;
      const last = chartData[chartData.length - 1].value;
      const change = last - first;
      const pct = first !== 0 ? (change / first) * 100 : 0;
      return {
        currentValue: last,
        changeValue: change,
        changePercent: pct,
        isPositive: change >= 0,
      };
    }, [chartData]);

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || max * 0.05 || 10;
    return [Math.max(0, min - padding), max + padding];
  }, [chartData]);

  if (addresses.length === 0) return null;

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-hl-text-primary">
            Portfolio Value
          </h2>
          {!loading && chartData.length > 0 && (
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-2xl font-semibold text-hl-text-primary font-mono">
                {formatTooltipValue(currentValue)}
              </span>
              <span
                className={`text-sm font-mono ${
                  isPositive ? "text-hl-green" : "text-hl-red"
                }`}
              >
                {isPositive ? "+" : ""}
                {formatTooltipValue(changeValue)} ({isPositive ? "+" : ""}
                {changePercent.toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
        <div className="flex gap-1 bg-hl-bg-tertiary rounded-lg p-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.key}
              onClick={() => setRange(tr.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                range === tr.key
                  ? "bg-hl-bg-hover text-hl-text-primary"
                  : "text-hl-text-tertiary hover:text-hl-text-secondary"
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-64">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="skeleton w-full h-full rounded-lg" />
          </div>
        ) : error ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-hl-text-tertiary">
            {error}
          </div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-hl-text-tertiary">
            No portfolio data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 4, right: 4, bottom: 0, left: 4 }}
            >
              <defs>
                <linearGradient
                  id="portfolioGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor={isPositive ? "#25d9a0" : "#ef4466"}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={isPositive ? "#25d9a0" : "#ef4466"}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#5a5a6a" }}
                tickFormatter={(t: number) => formatChartTime(t, range)}
                minTickGap={50}
              />
              <YAxis
                domain={yDomain}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#5a5a6a" }}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v.toFixed(0)}`
                }
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1c1c22",
                  border: "1px solid #2a2a35",
                  borderRadius: "8px",
                  padding: "8px 12px",
                }}
                labelStyle={{ color: "#8a8a98", fontSize: 11 }}
                itemStyle={{ color: "#e8e8ea", fontSize: 13, fontFamily: "monospace" }}
                labelFormatter={(label) =>
                  new Date(label as number).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })
                }
                formatter={(value) => [
                  formatTooltipValue(value as number),
                  "Value",
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={isPositive ? "#25d9a0" : "#ef4466"}
                strokeWidth={2}
                fill="url(#portfolioGradient)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: isPositive ? "#25d9a0" : "#ef4466",
                  stroke: "#0e0e10",
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
