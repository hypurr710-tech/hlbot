"use client";

import { useState, useEffect, useCallback } from "react";
import { useAddresses } from "@/lib/store";
import {
  getAddressStats,
  getPortfolioHistory,
  AddressStats,
  PortfolioPeriodData,
} from "@/lib/hyperliquid";
import { formatUsd, pnlColor } from "@/lib/format";
import StatCard from "@/components/StatCard";
import PortfolioChart from "@/components/PortfolioChart";
import Link from "next/link";

const basePath = process.env.NODE_ENV === "production" ? "/hlbot" : "";

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

export default function Dashboard() {
  const { addresses } = useAddresses();
  const [stats, setStats] = useState<AddressStats[]>([]);
  const [portfolioData, setPortfolioData] = useState<
    Record<string, Record<string, PortfolioPeriodData>>
  >({});
  const [loading, setLoading] = useState(true);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchStats = useCallback(async () => {
    if (addresses.length === 0) {
      setStats([]);
      setPortfolioData({});
      setLoading(false);
      setPortfolioLoading(false);
      return;
    }
    setLoading(true);
    setPortfolioLoading(true);
    try {
      const [statsResults, portfolioResults] = await Promise.all([
        Promise.allSettled(
          addresses.map((a) => getAddressStats(a.address))
        ),
        Promise.allSettled(
          addresses.map(async (a) => ({
            address: a.address,
            data: await getPortfolioHistory(a.address),
          }))
        ),
      ]);

      const successful = statsResults
        .filter(
          (r): r is PromiseFulfilledResult<AddressStats> =>
            r.status === "fulfilled"
        )
        .map((r) => r.value);
      setStats(successful);

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

      setLastUpdated(new Date());
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
    setLoading(false);
    setPortfolioLoading(false);
  }, [addresses]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30_000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // 30-day stats from fills
  const totals = stats.reduce(
    (acc, s) => ({
      volume: acc.volume + safeNum(s.totalVolume),
      fees: acc.fees + safeNum(s.totalFees),
      builderFees: acc.builderFees + safeNum(s.totalBuilderFees),
      realizedPnl: acc.realizedPnl + safeNum(s.realizedPnl),
      unrealizedPnl: acc.unrealizedPnl + safeNum(s.unrealizedPnl),
      accountValue: acc.accountValue + safeNum(s.accountValue),
      trades: acc.trades + safeNum(s.totalTrades),
      fundingPnl: acc.fundingPnl + safeNum(s.fundingPnl),
    }),
    {
      volume: 0,
      fees: 0,
      builderFees: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      accountValue: 0,
      trades: 0,
      fundingPnl: 0,
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
            src={`${basePath}/purr-main.jpg`}
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src={`${basePath}/purr-avatar.png`}
            alt="Purr"
            width={40}
            height={40}
            className="rounded-full object-cover"
          />
          <div>
            <h1 className="text-2xl font-semibold text-hl-text-primary">
              Dashboard
            </h1>
            <p className="text-sm text-hl-text-secondary mt-1">
              {addresses.length} address{addresses.length !== 1 ? "es" : ""}{" "}
              tracked
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-hl-text-tertiary">
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
            className="px-4 py-2 bg-hl-bg-tertiary border border-hl-border rounded-lg text-xs font-medium text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-4 gap-4">
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
          subtitle={`30D: ${formatUsd(totals.volume)} (${totals.trades.toLocaleString()} trades)`}
          loading={portfolioLoading}
        />
        <StatCard
          title="30D Fees"
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

      {/* Secondary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="Perps Account"
          value={formatUsd(totals.accountValue)}
          subtitle="Clearinghouse value"
          loading={loading}
        />
        <StatCard
          title="Unrealized PnL"
          value={formatUsd(totals.unrealizedPnl)}
          loading={loading}
        />
        <StatCard
          title="Funding PnL"
          value={formatUsd(totals.fundingPnl)}
          subtitle="30D"
          loading={loading}
        />
        <StatCard
          title="Realized PnL"
          value={formatUsd(totals.realizedPnl)}
          subtitle="30D"
          loading={loading}
        />
      </div>

      {/* Per-Address Breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
          Per-Address Breakdown
        </h2>
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-hl-border">
                <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-left">
                  Address
                </th>
                <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                  Portfolio Value
                </th>
                <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                  All-Time Volume
                </th>
                <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                  All-Time PnL
                </th>
                <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                  30D Trades
                </th>
                <th className="px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-right">
                  30D Fees
                </th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-hl-border/50">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="skeleton h-4 w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                : stats.map((s) => {
                    const addrLabel = addresses.find(
                      (a) =>
                        a.address.toLowerCase() === s.address.toLowerCase()
                    )?.label;
                    const addrPortfolio = latestFromHistory(
                      portfolioData[s.address]?.allTime?.accountValueHistory
                    );
                    const addrAllTimeVlm = safeNum(
                      parseFloat(
                        portfolioData[s.address]?.allTime?.vlm || "0"
                      )
                    );
                    const addrAllTimePnl = latestFromHistory(
                      portfolioData[s.address]?.allTime?.pnlHistory
                    );
                    return (
                      <tr
                        key={s.address}
                        className="border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            {addrLabel && (
                              <span className="text-sm font-medium text-hl-text-primary">
                                {addrLabel}
                              </span>
                            )}
                            <span className="text-xs font-mono text-hl-text-tertiary">
                              {s.address.slice(0, 6)}...{s.address.slice(-4)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                          {formatUsd(addrPortfolio)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                          {formatUsd(addrAllTimeVlm)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right text-sm font-mono ${pnlColor(
                            addrAllTimePnl
                          )}`}
                        >
                          {formatUsd(addrAllTimePnl)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-secondary">
                          {s.totalTrades.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                          {formatUsd(
                            safeNum(s.totalFees) +
                              safeNum(s.totalBuilderFees)
                          )}
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Positions */}
      {!loading && stats.some((s) => s.positions.length > 0) && (
        <div>
          <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
            Active Positions
          </h2>
          <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
            <table className="w-full">
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
      )}
    </div>
  );
}
