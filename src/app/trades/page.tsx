"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAddresses } from "@/lib/store";
import {
  getAllUserFills,
  getClearinghouseState,
  getPortfolioHistory,
  Fill,
  Position,
  PortfolioPeriodData,
} from "@/lib/hyperliquid";
import { formatUsd, pnlColor, formatAddress } from "@/lib/format";

type SortKey = "coin" | "trades" | "volume" | "pnl" | "fees";
type SortDir = "asc" | "desc";

interface CoinSummary {
  coin: string;
  trades: number;
  volume: number;
  pnl: number;
  fees: number;
}

interface WalletPosition extends Position {
  wallet: string;
}

// Hyperliquid launch era
const ALL_TIME_START = 1672531200000;

function safeNum(val: number | undefined | null): number {
  if (val === undefined || val === null || isNaN(val)) return 0;
  return val;
}

export default function TradesPage() {
  const { addresses } = useAddresses();
  // All-time fills for coin summary
  const [allTimeFills, setAllTimeFills] = useState<
    (Fill & { wallet: string })[]
  >([]);
  // Active positions
  const [positions, setPositions] = useState<WalletPosition[]>([]);
  // Portfolio API data for accurate header stats
  const [portfolioVolume, setPortfolioVolume] = useState<number>(0);
  const [portfolioPnl, setPortfolioPnl] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [headerReady, setHeaderReady] = useState(false);
  const [filterCoin, setFilterCoin] = useState<string>("all");
  const [filterAddress, setFilterAddress] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showSummary, setShowSummary] = useState(true);

  const hasLoadedOnce = useRef(false);

  const fetchData = useCallback(async () => {
    if (addresses.length === 0) {
      setPositions([]);
      setAllTimeFills([]);
      setPortfolioVolume(0);
      setPortfolioPnl(0);
      setLoading(false);
      setSummaryLoading(false);
      setHeaderReady(true);
      return;
    }

    const isFirstLoad = !hasLoadedOnce.current;
    if (isFirstLoad) {
      setLoading(true);
      setSummaryLoading(true);
    }

    // Phase 1: Portfolio API (fast) + Positions (fast)
    try {
      const [portfolioResults, positionResults] = await Promise.all([
        Promise.allSettled(
          addresses.map((a) => getPortfolioHistory(a.address))
        ),
        Promise.allSettled(
          addresses.map(async (a) => {
            const state = await getClearinghouseState(a.address);
            return state.assetPositions
              .filter((ap) => parseFloat(ap.position.szi) !== 0)
              .map((ap) => ({ ...ap.position, wallet: a.address }));
          })
        ),
      ]);

      // Portfolio header stats (accurate, from server)
      let totalVlm = 0;
      let totalPnl = 0;
      for (const r of portfolioResults) {
        if (r.status === "fulfilled") {
          const data = r.value as Record<string, PortfolioPeriodData>;
          totalVlm += safeNum(parseFloat(data.allTime?.vlm || "0"));
          const pnlHist = data.allTime?.pnlHistory;
          if (pnlHist && pnlHist.length > 0) {
            totalPnl += safeNum(parseFloat(pnlHist[pnlHist.length - 1][1]));
          }
        }
      }
      setPortfolioVolume(totalVlm);
      setPortfolioPnl(totalPnl);
      setHeaderReady(true);

      // Active positions
      const allPositions = positionResults
        .filter(
          (r): r is PromiseFulfilledResult<WalletPosition[]> =>
            r.status === "fulfilled"
        )
        .flatMap((r) => r.value);
      setPositions(allPositions);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch Phase 1:", err);
      setLoading(false);
    }

    // Phase 2: All-time fills (slower, for coin summary)
    try {
      const results = await Promise.allSettled(
        addresses.map(async (a) => {
          const f = await getAllUserFills(
            a.address,
            ALL_TIME_START,
            undefined,
            100
          );
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
    if (
      filterAddress !== "all" &&
      f.wallet.toLowerCase() !== filterAddress.toLowerCase()
    )
      return false;
    return true;
  });

  const coins = [...new Set(allTimeFills.map((f) => f.coin))].sort();

  const coinSummaries = useMemo(() => {
    const map = new Map<string, CoinSummary>();
    for (const f of allTimeFiltered) {
      const existing = map.get(f.coin) || {
        coin: f.coin,
        trades: 0,
        volume: 0,
        pnl: 0,
        fees: 0,
      };
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

  const totalFees = allTimeFiltered.reduce(
    (sum, f) => sum + parseFloat(f.fee),
    0
  );
  const fillPnl = allTimeFiltered.reduce(
    (sum, f) => sum + parseFloat(f.closedPnl),
    0
  );

  // Use portfolio API for header (accurate)
  const headerVolume =
    headerReady && portfolioVolume > 0 ? portfolioVolume : 0;
  const headerPnl = headerReady && portfolioVolume > 0 ? portfolioPnl : fillPnl;

  // Filtered positions
  const filteredPositions = positions.filter((p) => {
    if (filterCoin !== "all" && p.coin !== filterCoin) return false;
    if (
      filterAddress !== "all" &&
      p.wallet.toLowerCase() !== filterAddress.toLowerCase()
    )
      return false;
    return true;
  });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "\u21D5";
    return sortDir === "asc" ? "\u2191" : "\u2193";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
            Trade History
          </h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            {headerReady ? (
              <>
                {formatUsd(headerVolume)} volume &middot;{" "}
                <span className={pnlColor(headerPnl)}>
                  {formatUsd(headerPnl)} PnL
                </span>
                {" "}&middot; {formatUsd(totalFees)} fees
                {!summaryLoading && (
                  <>
                    {" "}&middot; {allTimeFiltered.length.toLocaleString()}{" "}
                    trades
                  </>
                )}
              </>
            ) : (
              "Loading..."
            )}
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
      </div>

      {/* Coin Summary (All-Time) */}
      {summaryLoading ? (
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-8 text-center">
          <div className="text-sm text-hl-text-tertiary">
            Loading coin summary...
          </div>
        </div>
      ) : (
        coinSummaries.length > 0 && (
          <div>
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="flex items-center gap-2 text-lg font-semibold text-hl-text-primary mb-4"
            >
              Coin Summary (All-Time)
              <span className="text-xs text-hl-text-tertiary">
                {showSummary ? "\u25BC" : "\u25B6"} {coinSummaries.length} pairs
              </span>
            </button>
            {showSummary && (
              <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden mb-6">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[500px]">
                    <thead>
                      <tr className="border-b border-hl-border">
                        {(
                          [
                            {
                              key: "coin" as SortKey,
                              label: "Coin",
                              align: "left",
                            },
                            {
                              key: "trades" as SortKey,
                              label: "Trades",
                              align: "right",
                            },
                            {
                              key: "volume" as SortKey,
                              label: "Volume",
                              align: "right",
                            },
                            {
                              key: "pnl" as SortKey,
                              label: "Closed PnL",
                              align: "right",
                            },
                            {
                              key: "fees" as SortKey,
                              label: "Fees",
                              align: "right",
                            },
                          ] as const
                        ).map((col) => (
                          <th
                            key={col.key}
                            onClick={() => handleSort(col.key)}
                            className={`px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider text-${col.align} cursor-pointer hover:text-hl-accent transition-colors select-none`}
                          >
                            {col.label}{" "}
                            <span className="text-hl-accent">
                              {sortIcon(col.key)}
                            </span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {coinSummaries.map((c) => (
                        <tr
                          key={c.coin}
                          onClick={() =>
                            setFilterCoin(
                              filterCoin === c.coin ? "all" : c.coin
                            )
                          }
                          className={`border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors cursor-pointer ${
                            filterCoin === c.coin ? "bg-hl-accent/10" : ""
                          }`}
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
                          <td
                            className={`px-4 py-3 text-right text-sm font-mono ${pnlColor(c.pnl)}`}
                          >
                            {formatUsd(c.pnl)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                            {formatUsd(c.fees)}
                          </td>
                        </tr>
                      ))}
                      {/* Total row - uses portfolio API volume for accuracy */}
                      <tr className="border-t-2 border-hl-accent/30 bg-hl-bg-tertiary/50">
                        <td className="px-4 py-3 text-sm font-semibold text-hl-accent">
                          Total
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-hl-text-primary">
                          {allTimeFiltered.length.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-mono font-semibold text-hl-text-primary">
                          {formatUsd(headerVolume)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right text-sm font-mono font-semibold ${pnlColor(headerPnl)}`}
                        >
                          {formatUsd(headerPnl)}
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
        )
      )}

      {/* Active Positions */}
      <div>
        <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
          Active Positions
          {positions.length > 0 && (
            <span className="text-xs text-hl-text-tertiary font-normal ml-2">
              {filteredPositions.length} position
              {filteredPositions.length !== 1 ? "s" : ""}
            </span>
          )}
        </h2>
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-hl-border">
                  {[
                    { label: "Address", align: "left" },
                    { label: "Coin", align: "left" },
                    { label: "Side", align: "center" },
                    { label: "Size", align: "right" },
                    { label: "Entry Price", align: "right" },
                    { label: "Leverage", align: "right" },
                    { label: "Position Value", align: "right" },
                    { label: "uPnL", align: "right" },
                    { label: "Liq. Price", align: "right" },
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
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b border-hl-border/50">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="skeleton h-4 w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredPositions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-12 text-center text-sm text-hl-text-tertiary"
                    >
                      No active positions.
                    </td>
                  </tr>
                ) : (
                  filteredPositions.map((p) => {
                    const size = parseFloat(p.szi);
                    const isLong = size > 0;
                    const upnl = safeNum(parseFloat(p.unrealizedPnl));
                    const posValue = safeNum(
                      Math.abs(parseFloat(p.positionValue))
                    );
                    const addrLabel = addresses.find(
                      (a) =>
                        a.address.toLowerCase() === p.wallet.toLowerCase()
                    )?.label;
                    return (
                      <tr
                        key={`${p.wallet}-${p.coin}`}
                        className="border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors"
                      >
                        <td className="px-4 py-2.5 text-xs font-mono text-hl-text-tertiary">
                          {addrLabel || formatAddress(p.wallet)}
                        </td>
                        <td className="px-4 py-2.5 text-sm font-medium text-hl-text-primary">
                          {p.coin}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              isLong
                                ? "bg-hl-green/10 text-hl-green"
                                : "bg-hl-red/10 text-hl-red"
                            }`}
                          >
                            {isLong ? "LONG" : "SHORT"}
                          </span>
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right text-sm font-mono ${
                            isLong ? "text-hl-green" : "text-hl-red"
                          }`}
                        >
                          {Math.abs(size).toFixed(4)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-hl-text-primary">
                          {p.entryPx
                            ? `$${parseFloat(p.entryPx).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-hl-yellow">
                          {p.leverage.value}x
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-hl-text-primary">
                          {formatUsd(posValue)}
                        </td>
                        <td
                          className={`px-4 py-2.5 text-right text-sm font-mono ${pnlColor(upnl)}`}
                        >
                          {formatUsd(upnl)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-sm font-mono text-hl-text-secondary">
                          {p.liquidationPx
                            ? `$${parseFloat(p.liquidationPx).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
    </div>
  );
}
