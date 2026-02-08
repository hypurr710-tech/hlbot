"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAddresses } from "@/lib/store";
import { getUserFills, getAllUserFills, Fill } from "@/lib/hyperliquid";
import { formatUsd, formatDate, pnlColor, formatAddress } from "@/lib/format";

type SortKey = "coin" | "trades" | "volume" | "pnl" | "fees";
type SortDir = "asc" | "desc";

interface CoinSummary {
  coin: string;
  trades: number;
  volume: number;
  pnl: number;
  fees: number;
}

// Hyperliquid launch era
const ALL_TIME_START = 1672531200000;
const RECENT_TRADES_LIMIT = 20;

export default function TradesPage() {
  const { addresses } = useAddresses();
  // All-time fills for coin summary
  const [allTimeFills, setAllTimeFills] = useState<(Fill & { wallet: string })[]>([]);
  // Recent fills for trade table (latest 20)
  const [recentFills, setRecentFills] = useState<(Fill & { wallet: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [filterCoin, setFilterCoin] = useState<string>("all");
  const [filterSide, setFilterSide] = useState<string>("all");
  const [filterAddress, setFilterAddress] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showSummary, setShowSummary] = useState(true);

  const hasLoadedOnce = useRef(false);

  const fetchData = useCallback(async () => {
    if (addresses.length === 0) {
      setRecentFills([]);
      setAllTimeFills([]);
      setLoading(false);
      setSummaryLoading(false);
      return;
    }

    const isFirstLoad = !hasLoadedOnce.current;
    if (isFirstLoad) {
      setLoading(true);
      setSummaryLoading(true);
    }

    // Phase 1: Recent fills (fast, for trade table)
    try {
      const results = await Promise.allSettled(
        addresses.map(async (a) => {
          const f = await getUserFills(a.address);
          return f.map((fill) => ({ ...fill, wallet: a.address }));
        })
      );
      const recent = results
        .filter(
          (r): r is PromiseFulfilledResult<(Fill & { wallet: string })[]> =>
            r.status === "fulfilled"
        )
        .flatMap((r) => r.value)
        .sort((a, b) => b.time - a.time);
      if (recent.length > 0 || isFirstLoad) {
        setRecentFills(recent);
      }
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch recent fills:", err);
      setLoading(false);
    }

    // Phase 2: All-time fills (slower, for coin summary)
    try {
      const results = await Promise.allSettled(
        addresses.map(async (a) => {
          const f = await getAllUserFills(a.address, ALL_TIME_START, undefined, 30);
          return f.map((fill) => ({ ...fill, wallet: a.address }));
        })
      );
      const allFills = results
        .filter(
          (r): r is PromiseFulfilledResult<(Fill & { wallet: string })[]> =>
            r.status === "fulfilled"
        )
        .flatMap((r) => r.value)
        .sort((a, b) => b.time - a.time);
      if (allFills.length > 0 || isFirstLoad) {
        setAllTimeFills(allFills);
      }
    } catch (err) {
      console.error("Failed to fetch all-time fills:", err);
    }

    hasLoadedOnce.current = true;
    setSummaryLoading(false);
  }, [addresses]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Coin summary uses all-time fills
  const allTimeFiltered = allTimeFills.filter((f) => {
    if (filterAddress !== "all" && f.wallet.toLowerCase() !== filterAddress.toLowerCase()) return false;
    return true;
  });

  const coins = [...new Set(allTimeFills.map((f) => f.coin))].sort();

  const coinSummaries = useMemo(() => {
    const map = new Map<string, CoinSummary>();
    for (const f of allTimeFiltered) {
      const existing = map.get(f.coin) || { coin: f.coin, trades: 0, volume: 0, pnl: 0, fees: 0 };
      existing.trades += 1;
      existing.volume += parseFloat(f.px) * parseFloat(f.sz);
      existing.pnl += parseFloat(f.closedPnl);
      existing.fees += parseFloat(f.fee);
      map.set(f.coin, existing);
    }
    const arr = Array.from(map.values());
    arr.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortKey === "coin") return mul * a.coin.localeCompare(b.coin);
      return mul * (a[sortKey] - b[sortKey]);
    });
    return arr;
  }, [allTimeFiltered, sortKey, sortDir]);

  const totalVolume = allTimeFiltered.reduce(
    (sum, f) => sum + parseFloat(f.px) * parseFloat(f.sz), 0
  );
  const totalFees = allTimeFiltered.reduce((sum, f) => sum + parseFloat(f.fee), 0);
  const totalPnl = allTimeFiltered.reduce((sum, f) => sum + parseFloat(f.closedPnl), 0);

  // Recent trades table uses recent fills with filters
  const filteredRecent = recentFills.filter((f) => {
    if (filterCoin !== "all" && f.coin !== filterCoin) return false;
    if (filterSide !== "all" && f.side !== filterSide) return false;
    if (filterAddress !== "all" && f.wallet.toLowerCase() !== filterAddress.toLowerCase()) return false;
    return true;
  });

  const displayTrades = filteredRecent.slice(0, RECENT_TRADES_LIMIT);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
            Trade History
          </h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            {allTimeFiltered.length.toLocaleString()} trades &middot;{" "}
            {formatUsd(totalVolume)} volume &middot; {formatUsd(totalFees)} fees &middot;{" "}
            <span className={pnlColor(totalPnl)}>{formatUsd(totalPnl)} PnL</span>
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading || summaryLoading}
          className="px-4 py-2 bg-hl-bg-tertiary border border-hl-border rounded-lg text-xs font-medium text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light transition-colors disabled:opacity-50"
        >
          {loading || summaryLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 md:gap-3 flex-wrap">
        <select
          value={filterAddress}
          onChange={(e) => setFilterAddress(e.target.value)}
          className="bg-hl-bg-tertiary border border-hl-border rounded-lg px-3 py-2 text-xs text-hl-text-primary focus:outline-none focus:border-hl-accent/50"
        >
          <option value="all">All Addresses</option>
          {addresses.map((a) => (
            <option key={a.address} value={a.address}>
              {a.label} ({formatAddress(a.address)})
            </option>
          ))}
        </select>
        <select
          value={filterCoin}
          onChange={(e) => setFilterCoin(e.target.value)}
          className="bg-hl-bg-tertiary border border-hl-border rounded-lg px-3 py-2 text-xs text-hl-text-primary focus:outline-none focus:border-hl-accent/50"
        >
          <option value="all">All Coins</option>
          {coins.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filterSide}
          onChange={(e) => setFilterSide(e.target.value)}
          className="bg-hl-bg-tertiary border border-hl-border rounded-lg px-3 py-2 text-xs text-hl-text-primary focus:outline-none focus:border-hl-accent/50"
        >
          <option value="all">All Sides</option>
          <option value="B">Buy</option>
          <option value="A">Sell</option>
        </select>
      </div>

      {/* Coin Summary (All-Time) */}
      {!summaryLoading && coinSummaries.length > 0 && (
        <div>
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center gap-2 text-lg font-semibold text-hl-text-primary mb-4"
          >
            코인별 요약 (All-Time)
            <span className="text-xs text-hl-text-tertiary">
              {showSummary ? "▼" : "▶"} {coinSummaries.length}개 페어
            </span>
          </button>
          {showSummary && (
            <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden mb-6">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-hl-border">
                      {([
                        { key: "coin" as SortKey, label: "코인", align: "left" },
                        { key: "trades" as SortKey, label: "거래수", align: "right" },
                        { key: "volume" as SortKey, label: "총 볼륨", align: "right" },
                        { key: "pnl" as SortKey, label: "Closed PnL", align: "right" },
                        { key: "fees" as SortKey, label: "수수료", align: "right" },
                      ]).map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-${col.align} cursor-pointer hover:text-hl-accent transition-colors select-none`}
                        >
                          {col.label} <span className="text-hl-accent">{sortIcon(col.key)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coinSummaries.map((c) => (
                      <tr
                        key={c.coin}
                        onClick={() => setFilterCoin(c.coin)}
                        className="border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-hl-text-primary">
                          {c.coin}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-secondary">
                          {c.trades.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                          {formatUsd(c.volume)}
                        </td>
                        <td className={`px-4 py-3 text-right text-sm font-mono ${pnlColor(c.pnl)}`}>
                          {formatUsd(c.pnl)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                          {formatUsd(c.fees)}
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr className="border-t-2 border-hl-accent/30 bg-hl-bg-tertiary/50">
                      <td className="px-4 py-3 text-sm font-semibold text-hl-accent">
                        합계
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-hl-text-primary">
                        {allTimeFiltered.length.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-hl-text-primary">
                        {formatUsd(totalVolume)}
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-mono font-semibold ${pnlColor(totalPnl)}`}>
                        {formatUsd(totalPnl)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-hl-red">
                        {formatUsd(totalFees)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Recent Trades (latest 20) */}
      <div>
        <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
          최근 거래
        </h2>
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="border-b border-hl-border">
                  {[
                    { label: "Time", align: "left" },
                    { label: "Address", align: "left" },
                    { label: "Coin", align: "left" },
                    { label: "Side", align: "center" },
                    { label: "Size", align: "right" },
                    { label: "Price", align: "right" },
                    { label: "Notional", align: "right" },
                    { label: "Fee", align: "right" },
                    { label: "Closed PnL", align: "right" },
                  ].map((col) => (
                    <th
                      key={col.label}
                      className={`px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-${col.align}`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} className="border-b border-hl-border/50">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="skeleton h-4 w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : displayTrades.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-sm text-hl-text-tertiary"
                    >
                      No trades found. Add addresses to track trading activity.
                    </td>
                  </tr>
                ) : (
                  displayTrades.map((fill) => {
                    const notional = parseFloat(fill.px) * parseFloat(fill.sz);
                    const closedPnl = parseFloat(fill.closedPnl);
                    const fee = parseFloat(fill.fee);
                    const addrLabel = addresses.find(
                      (a) =>
                        a.address.toLowerCase() === fill.wallet.toLowerCase()
                    )?.label;
                    return (
                      <tr
                        key={`${fill.tid}-${fill.hash}`}
                        className="border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-xs text-hl-text-secondary whitespace-nowrap">
                          {formatDate(fill.time)}
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono text-hl-text-tertiary">
                          {addrLabel || formatAddress(fill.wallet)}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-medium text-hl-text-primary">
                          {fill.coin}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              fill.side === "B"
                                ? "bg-hl-green/10 text-hl-green"
                                : "bg-hl-red/10 text-hl-red"
                            }`}
                          >
                            {fill.side === "B" ? "BUY" : "SELL"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-hl-text-primary">
                          {parseFloat(fill.sz).toFixed(4)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-hl-text-primary">
                          ${parseFloat(fill.px).toFixed(2)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-hl-text-primary">
                          {formatUsd(notional)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-hl-red-dim">
                          {formatUsd(fee)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right text-sm font-mono ${pnlColor(
                            closedPnl
                          )}`}
                        >
                          {closedPnl !== 0 ? formatUsd(closedPnl) : "-"}
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
    </div>
  );
}
