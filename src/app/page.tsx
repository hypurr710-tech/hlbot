"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useAddresses } from "@/lib/store";
import {
  getAddressStats,
  getAddressStatsLight,
  getPortfolioHistory,
  AddressStats,
  PortfolioPeriodData,
} from "@/lib/hyperliquid";
import { formatUsd, pnlColor } from "@/lib/format";
import StatCard from "@/components/StatCard";
import PortfolioChart from "@/components/PortfolioChart";
import Link from "next/link";

/** Safely parse a number, returning 0 for NaN/undefined */
function safeNum(val: number | undefined | null): number {
  if (val === undefined || val === null || isNaN(val)) return 0;
  return val;
}

/** Get the latest value from a portfolio history array */
function latestFromHistory(history: [number, string][] | undefined): number {
  if (!history || history.length === 0) return 0;
  return safeNum(parseFloat(history[history.length - 1][1]));
}

import { TrackedAddress, saveAddresses } from "@/lib/store";

type AddrSortKey = "label" | "portfolio" | "volume" | "pnl" | "fees";

function PerAddressTable({
  stats,
  addresses,
  portfolioData,
  loading,
}: {
  stats: AddressStats[];
  addresses: TrackedAddress[];
  portfolioData: Record<string, Record<string, PortfolioPeriodData>>;
  loading: boolean;
}) {
  const { setAddresses } = useAddresses();
  const [sortKey, setSortKey] = useState<AddrSortKey>("portfolio");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const rows = useMemo(() => {
    return stats.map((s) => {
      const addrLabel = addresses.find(
        (a) => a.address.toLowerCase() === s.address.toLowerCase()
      )?.label || "";
      const portfolio = latestFromHistory(
        portfolioData[s.address]?.allTime?.accountValueHistory
      );
      const volume = safeNum(parseFloat(portfolioData[s.address]?.allTime?.vlm || "0"));
      const pnl = latestFromHistory(portfolioData[s.address]?.allTime?.pnlHistory);
      const fees = safeNum(s.totalFees) + safeNum(s.totalBuilderFees);
      return { address: s.address, label: addrLabel, portfolio, volume, pnl, fees };
    });
  }, [stats, addresses, portfolioData]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    const mul = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sortKey === "label") return mul * a.label.localeCompare(b.label);
      return mul * (a[sortKey] - b[sortKey]);
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const handleSort = (key: AddrSortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const icon = (key: AddrSortKey) => {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  const handleDrop = (toIdx: number) => {
    if (dragIdx === null || dragIdx === toIdx) { setDragIdx(null); setDragOverIdx(null); return; }
    const updated = [...addresses];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(toIdx, 0, moved);
    saveAddresses(updated);
    setAddresses(updated);
    setDragIdx(null);
    setDragOverIdx(null);
    setSortKey("label"); // reset to manual order
  };

  // When using manual drag, show addresses order; when sorting, show sorted
  const displayRows = sortKey === "label" && sortDir === "asc" ?
    addresses.map((a) => rows.find((r) => r.address.toLowerCase() === a.address.toLowerCase())).filter(Boolean) as typeof rows :
    sorted;

  const cols: { key: AddrSortKey; label: string; align: string }[] = [
    { key: "label", label: "Address", align: "left" },
    { key: "portfolio", label: "Portfolio Value", align: "right" },
    { key: "volume", label: "All-Time Volume", align: "right" },
    { key: "pnl", label: "All-Time PnL", align: "right" },
    { key: "fees", label: "All-Time Fees", align: "right" },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
        Per-Address Breakdown
      </h2>
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-hl-border">
              {cols.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-${col.align} cursor-pointer hover:text-hl-accent transition-colors select-none`}
                >
                  {col.label} <span className="text-hl-accent">{icon(col.key)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-hl-border/50">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="skeleton h-4 w-20" />
                      </td>
                    ))}
                  </tr>
                ))
              : displayRows.map((r, idx) => (
                  <tr
                    key={r.address}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                    className={`border-b border-hl-border/50 transition-all cursor-grab active:cursor-grabbing ${
                      dragIdx === idx ? "opacity-40" : dragOverIdx === idx ? "bg-hl-accent/5 border-t-2 border-t-hl-accent" : "hover:bg-hl-bg-hover/50"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-hl-text-tertiary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                        </svg>
                        <div className="flex flex-col">
                          {r.label && (
                            <span className="text-sm font-medium text-hl-text-primary">{r.label}</span>
                          )}
                          <span className="text-xs font-mono text-hl-text-tertiary">
                            {r.address.slice(0, 6)}...{r.address.slice(-4)}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                      {formatUsd(r.portfolio)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                      {formatUsd(r.volume)}
                    </td>
                    <td className={`px-4 py-3 text-right text-sm font-mono ${pnlColor(r.pnl)}`}>
                      {formatUsd(r.pnl)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                      {formatUsd(r.fees)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { addresses } = useAddresses();
  const [stats, setStats] = useState<AddressStats[]>([]);
  const [portfolioData, setPortfolioData] = useState<
    Record<string, Record<string, PortfolioPeriodData>>
  >({});
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const hasLoadedOnce = useRef(false);

  const fetchStats = useCallback(async () => {
    if (addresses.length === 0) {
      setStats([]);
      setPortfolioData({});
      setLoading(false);
      setPortfolioLoading(false);
      return;
    }

    const isFirstLoad = !hasLoadedOnce.current;

    // Only show loading skeleton on the very first fetch
    if (isFirstLoad) {
      setLoading(true);
      setPortfolioLoading(true);
    }

    // Phase 1: portfolio + lightweight stats (fast, no fill pagination)
    try {
      const [portfolioResults, lightStatsResults] = await Promise.all([
        Promise.allSettled(
          addresses.map(async (a) => ({
            address: a.address,
            data: await getPortfolioHistory(a.address),
          }))
        ),
        Promise.allSettled(
          addresses.map((a) => getAddressStatsLight(a.address))
        ),
      ]);

      const newPortfolio: Record<
        string,
        Record<string, PortfolioPeriodData>
      > = {};
      for (const r of portfolioResults) {
        if (r.status === "fulfilled") {
          newPortfolio[r.value.address] = r.value.data;
        }
      }
      setPortfolioData(newPortfolio);
      setPortfolioLoading(false);

      // Only use light stats on first load; on refresh keep existing full data
      if (isFirstLoad) {
        const lightStats = lightStatsResults
          .filter(
            (r): r is PromiseFulfilledResult<AddressStats> =>
              r.status === "fulfilled"
          )
          .map((r) => r.value);
        setStats(lightStats);
        setLoading(false);
      }
    } catch (err) {
      console.error("Failed to fetch portfolio:", err);
      setPortfolioLoading(false);
      setLoading(false);
    }

    // Phase 2: full all-time stats with fills (background, slower)
    try {
      const fullStatsResults = await Promise.allSettled(
        addresses.map((a) => getAddressStats(a.address))
      );
      const fullStats = fullStatsResults
        .filter(
          (r): r is PromiseFulfilledResult<AddressStats> =>
            r.status === "fulfilled"
        )
        .map((r) => r.value);
      if (fullStats.length > 0) {
        setStats(fullStats);
      }
    } catch (err) {
      console.error("Failed to fetch full stats:", err);
    }

    hasLoadedOnce.current = true;
    setLoading(false);
    setLastUpdated(new Date());
  }, [addresses]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 60_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // All-time stats from fills
  const totals = stats.reduce(
    (acc, s) => ({
      volume: acc.volume + safeNum(s.totalVolume),
      fees: acc.fees + safeNum(s.totalFees),
      builderFees: acc.builderFees + safeNum(s.totalBuilderFees),
      realizedPnl: acc.realizedPnl + safeNum(s.realizedPnl),
      unrealizedPnl: acc.unrealizedPnl + safeNum(s.unrealizedPnl),
      accountValue: acc.accountValue + safeNum(s.accountValue),
      trades: acc.trades + safeNum(s.totalTrades),
    }),
    {
      volume: 0,
      fees: 0,
      builderFees: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      accountValue: 0,
      trades: 0,
    }
  );

  // All-time stats from portfolio API (includes spot + perps + staked)
  const portfolioValue = Object.values(portfolioData).reduce((sum, d) => {
    return sum + latestFromHistory(d.allTime?.accountValueHistory);
  }, 0);

  const allTimeVolume = Object.values(portfolioData).reduce((sum, d) => {
    return sum + safeNum(parseFloat(d.allTime?.vlm || "0"));
  }, 0);

  const allTimePnl = Object.values(portfolioData).reduce((sum, d) => {
    return sum + latestFromHistory(d.allTime?.pnlHistory);
  }, 0);

  if (addresses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] animate-fade-in relative">
        {/* Background Purr scene */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-gradient-to-t from-hl-bg-primary via-transparent to-transparent z-10 rounded-2xl" />
          <img
            src="/purr-main.jpg"
            alt="Purr - Hyperliquid Mascot"
            className="rounded-2xl opacity-80 max-w-[360px] w-full"
          />
        </div>
        <h2 className="text-2xl font-bold gradient-text mb-2">
          Welcome to Hypurr Tracker
        </h2>
        <p className="text-sm text-hl-text-secondary mb-6 text-center max-w-md">
          Add your Hyperliquid wallet addresses to start tracking your
          portfolio, trading volume, fees, and PnL.
        </p>
        <Link
          href="/address"
          className="px-6 py-3 bg-hl-accent text-hl-bg-primary rounded-lg text-sm font-semibold hover:bg-hl-accent/90 transition-colors"
        >
          Add Address
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <img
            src="/purr-avatar.png"
            alt="Purr"
            width={40}
            height={40}
            className="rounded-full object-cover flex-shrink-0 hidden sm:block"
          />
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
              Dashboard
            </h1>
            <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
              {addresses.length} address{addresses.length !== 1 ? "es" : ""}{" "}
              tracked
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          {lastUpdated && (
            <span className="text-xs text-hl-text-tertiary hidden sm:inline">
              Updated{" "}
              {lastUpdated.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}
            </span>
          )}
          <button
            onClick={fetchStats}
            disabled={loading}
            className="px-3 md:px-4 py-2 bg-hl-bg-tertiary border border-hl-border rounded-lg text-xs font-medium text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="Portfolio Value"
          value={formatUsd(portfolioValue)}
          subtitle="Perps + Spot + Staked"
          loading={portfolioLoading}
        />
        <StatCard
          title="All-Time PnL"
          value={formatUsd(allTimePnl)}
          subtitle="Combined"
          loading={portfolioLoading}
        />
        <StatCard
          title="All-Time Volume"
          value={formatUsd(allTimeVolume)}
          subtitle={`${totals.trades.toLocaleString()} trades`}
          loading={portfolioLoading}
        />
        <StatCard
          title="All-Time Fees"
          value={formatUsd(totals.fees + totals.builderFees)}
          subtitle={`Trading ${formatUsd(totals.fees)} + Builder ${formatUsd(totals.builderFees)}`}
          loading={loading}
        />
      </div>

      {/* Portfolio Chart with Volume/PnL */}
      <PortfolioChart
        portfolioData={portfolioData}
        loading={portfolioLoading}
      />

      {/* Per-Address Breakdown */}
      <PerAddressTable
        stats={stats}
        addresses={addresses}
        portfolioData={portfolioData}
        loading={loading}
      />

      {/* Active Positions */}
      {!loading && stats.some((s) => s.positions.length > 0) && (
        <div>
          <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
            Active Positions
          </h2>
          <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-hl-border">
                  <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-left">
                    Address
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-left">
                    Coin
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                    Size
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                    Entry Price
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                    Leverage
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                    uPnL
                  </th>
                  <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                    Liq. Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {stats.flatMap((s) =>
                  s.positions.map((p) => {
                    const addrLabel = addresses.find(
                      (a) =>
                        a.address.toLowerCase() === s.address.toLowerCase()
                    )?.label;
                    const size = parseFloat(p.szi);
                    const upnl = safeNum(parseFloat(p.unrealizedPnl));
                    return (
                      <tr
                        key={`${s.address}-${p.coin}`}
                        className="border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs font-mono text-hl-text-tertiary">
                          {addrLabel ||
                            `${s.address.slice(0, 6)}...${s.address.slice(-4)}`}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-hl-text-primary">
                          {p.coin}
                        </td>
                        <td
                          className={`px-4 py-3 text-right text-sm font-mono ${
                            size >= 0 ? "text-hl-green" : "text-hl-red"
                          }`}
                        >
                          {size >= 0 ? "+" : ""}
                          {size.toFixed(4)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                          {p.entryPx
                            ? `$${parseFloat(p.entryPx).toFixed(2)}`
                            : "-"}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-yellow">
                          {p.leverage.value}x
                        </td>
                        <td
                          className={`px-4 py-3 text-right text-sm font-mono ${pnlColor(
                            upnl
                          )}`}
                        >
                          {formatUsd(upnl)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-secondary">
                          {p.liquidationPx
                            ? `$${parseFloat(p.liquidationPx).toFixed(2)}`
                            : "-"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
