"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PortfolioPeriodData, PortfolioTimeRange } from "@/lib/hyperliquid";

export interface PortfolioChartProps {
  /** portfolioData keyed by address, then by period name */
  portfolioData: Record<string, Record<string, PortfolioPeriodData>>;
  loading: boolean;
}

type ChartMode = "accountValue" | "pnl";

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

const CHART_MODES: { key: ChartMode; label: string }[] = [
  { key: "pnl", label: "PnL" },
  { key: "accountValue", label: "Account Value" },
];

function formatChartTime(
  timestamp: number,
  range: PortfolioTimeRange
): string {
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
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function formatVolume(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function mergeHistories(
  histories: PortfolioPeriodData[],
  range: PortfolioTimeRange,
  mode: ChartMode
): ChartDataPoint[] {
  if (histories.length === 0) return [];

  const getHistory = (h: PortfolioPeriodData) =>
    mode === "pnl" ? h.pnlHistory : h.accountValueHistory;

  if (histories.length === 1) {
    return getHistory(histories[0]).map(([time, val]) => ({
      time,
      value: parseFloat(val),
    }));
  }

  const allPoints = histories.flatMap((h, idx) =>
    getHistory(h).map(
      ([time, val]) => ({ time, value: parseFloat(val), addr: idx } as const)
    )
  );
  allPoints.sort((a, b) => a.time - b.time);

  if (allPoints.length === 0) return [];

  const bucketMs =
    range === "day"
      ? 5 * 60_000
      : range === "week"
      ? 30 * 60_000
      : range === "month"
      ? 4 * 3600_000
      : 24 * 3600_000;

  const addrCount = histories.length;
  const latestValues = new Array(addrCount).fill(0);
  const merged: ChartDataPoint[] = [];

  let bucketStart = allPoints[0].time;
  let i = 0;

  while (i < allPoints.length) {
    const bucketEnd = bucketStart + bucketMs;
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

export default function PortfolioChart({
  portfolioData,
  loading,
}: PortfolioChartProps) {
  const [range, setRange] = useState<PortfolioTimeRange>("allTime");
  const [chartMode, setChartMode] = useState<ChartMode>("pnl");

  const chartData = useMemo(() => {
    const periodDataList: PortfolioPeriodData[] = [];
    for (const addrData of Object.values(portfolioData)) {
      if (addrData[range]) {
        periodDataList.push(addrData[range]);
      }
    }
    return mergeHistories(periodDataList, range, chartMode);
  }, [portfolioData, range, chartMode]);

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

  // For PnL mode, color is based on the current (last) value being positive/negative
  const linePositive =
    chartMode === "pnl" ? currentValue >= 0 : isPositive;

  const yDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];
    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const padding = (max - min) * 0.1 || Math.abs(max) * 0.05 || 10;
    if (chartMode === "pnl") {
      return [min - padding, max + padding];
    }
    return [Math.max(0, min - padding), max + padding];
  }, [chartData, chartMode]);

  const totalVolume = useMemo(() => {
    let vlm = 0;
    for (const addrData of Object.values(portfolioData)) {
      if (addrData[range]) {
        vlm += parseFloat(addrData[range].vlm || "0");
      }
    }
    return vlm;
  }, [portfolioData, range]);

  // Track container dimensions to avoid rendering chart with invalid size
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerReady, setContainerReady] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      const { width, height } = el.getBoundingClientRect();
      setContainerReady(width > 0 && height > 0);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (Object.keys(portfolioData).length === 0 && !loading) return null;

  // Updated colors to match the Hyperliquid teal theme
  const positiveColor = "#50e3c2";
  const negativeColor = "#ef4466";
  const lineColor = linePositive ? positiveColor : negativeColor;

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 md:p-6 glow-hover">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        {/* Chart Mode Tabs */}
        <div className="flex gap-1 bg-hl-bg-tertiary rounded-lg p-1">
          {CHART_MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setChartMode(m.key)}
              className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                chartMode === m.key
                  ? "bg-hl-bg-hover text-hl-accent"
                  : "text-hl-text-tertiary hover:text-hl-text-secondary"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {/* Time Range Tabs */}
        <div className="flex gap-1 bg-hl-bg-tertiary rounded-lg p-1">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.key}
              onClick={() => setRange(tr.key)}
              className={`px-2 md:px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                range === tr.key
                  ? "bg-hl-bg-hover text-hl-accent"
                  : "text-hl-text-tertiary hover:text-hl-text-secondary"
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      {!loading && (
        <div className="flex items-baseline gap-4 md:gap-6 mb-4 flex-wrap">
          <div>
            <span className="text-xs text-hl-text-tertiary">Volume</span>
            <p className="text-lg font-semibold font-mono text-hl-text-primary">
              {formatVolume(totalVolume)}
            </p>
          </div>
          <div>
            <span className="text-xs text-hl-text-tertiary">
              {chartMode === "pnl" ? "All PnL (Combined)" : "Account Value"}
            </span>
            <p
              className={`text-lg font-semibold font-mono ${
                chartMode === "pnl"
                  ? currentValue >= 0
                    ? "text-hl-green"
                    : "text-hl-red"
                  : "text-hl-text-primary"
              }`}
            >
              {formatTooltipValue(currentValue)}
            </p>
          </div>
          {chartData.length >= 2 && (
            <div>
              <span className="text-xs text-hl-text-tertiary">Change</span>
              <p
                className={`text-sm font-mono ${
                  isPositive ? "text-hl-green" : "text-hl-red"
                }`}
              >
                {isPositive ? "+" : ""}
                {formatTooltipValue(changeValue)} ({isPositive ? "+" : ""}
                {changePercent.toFixed(2)}%)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div ref={containerRef} className="h-48 md:h-64">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="skeleton w-full h-full rounded-lg" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-hl-text-tertiary">
            No portfolio data available
          </div>
        ) : !containerReady ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="skeleton w-full h-full rounded-lg" />
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
                    stopColor={lineColor}
                    stopOpacity={0.25}
                  />
                  <stop
                    offset="100%"
                    stopColor={lineColor}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#546678" }}
                tickFormatter={(t: number) => formatChartTime(t, range)}
                minTickGap={50}
              />
              <YAxis
                domain={yDomain}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: "#546678" }}
                tickFormatter={(v: number) => {
                  const abs = Math.abs(v);
                  const sign = v < 0 ? "-" : "";
                  if (abs >= 1_000_000)
                    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
                  if (abs >= 1000)
                    return `${sign}$${(abs / 1000).toFixed(1)}K`;
                  return `${sign}$${abs.toFixed(0)}`;
                }}
                width={65}
              />
              {chartMode === "pnl" && (
                <line
                  x1="0%"
                  x2="100%"
                  y1="50%"
                  y2="50%"
                  stroke="#1e2a36"
                  strokeDasharray="4 4"
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f1318",
                  border: "1px solid #1e2a36",
                  borderRadius: "8px",
                  padding: "8px 12px",
                }}
                labelStyle={{ color: "#8a99a8", fontSize: 11 }}
                itemStyle={{
                  color: "#e8ecf0",
                  fontSize: 13,
                  fontFamily: "monospace",
                }}
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
                  chartMode === "pnl" ? "PnL" : "Value",
                ]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={2}
                fill="url(#portfolioGradient)"
                dot={false}
                activeDot={{
                  r: 4,
                  fill: lineColor,
                  stroke: "#0b0e11",
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
