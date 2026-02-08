"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAddresses } from "@/lib/store";
import { getUserFills, Fill } from "@/lib/hyperliquid";
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

export default function TradesPage() {
  const { addresses } = useAddresses();
  const [fills, setFills] = useState<(Fill & { wallet: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCoin, setFilterCoin] = useState<string>("all");
  const [filterSide, setFilterSide] = useState<string>("all");
  const [filterAddress, setFilterAddress] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showSummary, setShowSummary] = useState(true);
  const perPage = 50;

  const hasLoadedOnce = useRef(false);

  const fetchFills = useCallback(async () => {
    if (addresses.length === 0) {
      setFills([]);
      setLoading(false);
      return;
    }
    if (!hasLoadedOnce.current) setLoading(true);
    try {
      // Fetch recent fills (latest 2000 per address, fast single API call)
      const results = await Promise.allSettled(
        addresses.map(async (a) => {
          const f = await getUserFills(a.address);
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
      // On refresh, only update if we got data (prevent flicker to empty)
      if (allFills.length > 0 || !hasLoadedOnce.current) {
        setFills(allFills);
      }
      hasLoadedOnce.current = true;
    } catch (err) {
      console.error("Failed to fetch fills:", err);
    }
    setLoading(false);
  }, [addresses]);

  useEffect(() => {
    fetchFills();
    const interval = setInterval(fetchFills, 60_000);
    return () => clearInterval(interval);
  }, [fetchFills]);

  const coins = [...new Set(fills.map((f) => f.coin))].sort();

  const filtered = fills.filter((f) => {
    if (filterCoin !== "all" && f.coin !== filterCoin) return false;
    if (filterSide !== "all" && f.side !== filterSide) return false;
    if (filterAddress !== "all" && f.wallet.toLowerCase() !== filterAddress.toLowerCase()) return false;
    return true;
  });

  const paginated = filtered.slice(page * perPage, (page + 1) * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const totalVolume = filtered.reduce(
    (sum, f) => sum + parseFloat(f.px) * parseFloat(f.sz),
    0
  );
  const totalFees = filtered.reduce((sum, f) => sum + parseFloat(f.fee), 0);
  const totalPnl = filtered.reduce((sum, f) => sum + parseFloat(f.closedPnl), 0);

  // Per-coin summary with sorting
  const coinSummaries = useMemo(() => {
    const map = new Map<string, CoinSummary>();
    for (const f of filtered) {
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
  }, [filtered, sortKey, sortDir]);

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
            {filtered.length.toLocaleString()} trades &middot;{" "}
            {formatUsd(totalVolume)} volume &middot; {formatUsd(totalFees)} fees &middot;{" "}
            <span className={pnlColor(totalPnl)}>{formatUsd(totalPnl)} PnL</span>
          </p>
        </div>
        <button
          onClick={fetchFills}
          disabled={loading}
          className="px-4 py-2 bg-hl-bg-tertiary border border-hl-border rounded-lg text-xs font-medium text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 md:gap-3 flex-wrap">
        <select
          value={filterAddress}
          onChange={(e) => {
            setFilterAddress(e.target.value);
            setPage(0);
          }}
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
          onChange={(e) => {
            setFilterCoin(e.target.value);
            setPage(0);
          }}
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
          onChange={(e) => {
            setFilterSide(e.target.value);
            setPage(0);
          }}
          className="bg-hl-bg-tertiary border border-hl-border rounded-lg px-3 py-2 text-xs text-hl-text-primary focus:outline-none focus:border-hl-accent/50"
        >
          <option value="all">All Sides</option>
          <option value="B">Buy</option>
          <option value="A">Sell</option>
        </select>
      </div>

      {/* Coin Summary */}
      {!loading && coinSummaries.length > 0 && (
        <div>
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="flex items-center gap-2 text-lg font-semibold text-hl-text-primary mb-4"
          >
            코인별 요약
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
                        onClick={() => {
                          setFilterCoin(c.coin);
                          setPage(0);
                        }}
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
                        {filtered.length.toLocaleString()}
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

      {/* Trade Table */}
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
              ) : paginated.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm text-hl-text-tertiary"
                  >
                    No trades found. Add addresses to track trading activity.
                  </td>
                </tr>
              ) : (
                paginated.map((fill) => {
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-hl-border">
            <span className="text-xs text-hl-text-tertiary">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 bg-hl-bg-tertiary border border-hl-border rounded text-xs text-hl-text-secondary hover:text-hl-text-primary disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 bg-hl-bg-tertiary border border-hl-border rounded text-xs text-hl-text-secondary hover:text-hl-text-primary disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
