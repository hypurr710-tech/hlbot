"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAddresses } from "@/lib/store";
import {
  getAllUserFills,
  getAllMids,
  getAllPositions,
  getPortfolioHistory,
  Fill,
  Position,
  PortfolioPeriodData,
} from "@/lib/hyperliquid";
import { formatUsd, pnlColor, formatAddress } from "@/lib/format";
import StatCard from "@/components/StatCard";

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

const ALL_TIME_START = 1672531200000;

function safeNum(val: number | undefined | null): number {
  if (val === undefined || val === null || isNaN(val)) return 0;
  return val;
}

function formatPrice(val: number): string {
  if (val >= 10000) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 100) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

export default function TradesPage() {
  const { addresses } = useAddresses();
  const [allTimeFills, setAllTimeFills] = useState<(Fill & { wallet: string })[]>([]);
  const [positions, setPositions] = useState<WalletPosition[]>([]);
  const [midPrices, setMidPrices] = useState<Record<string, string>>({});

  // Portfolio API stats (accurate, server-calculated)
  const [portfolioVolume, setPortfolioVolume] = useState<number>(0);
  const [portfolioPnl, setPortfolioPnl] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [fillsLoading, setFillsLoading] = useState(true);
  const [headerReady, setHeaderReady] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [filterCoin, setFilterCoin] = useState<string>("all");
  const [filterAddress, setFilterAddress] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showSummary, setShowSummary] = useState(true);
  const [countdown, setCountdown] = useState(60);

  const fillsLoaded = useRef(false);

  // Phase 1: Fast data - portfolio stats + positions + prices (runs every 60s)
  const fetchFastData = useCallback(async () => {
    if (addresses.length === 0) {
      setPositions([]);
      setPortfolioVolume(0);
      setPortfolioPnl(0);
      setMidPrices({});
      setLoading(false);
      setHeaderReady(true);
      return;
    }

    try {
      const [portfolioResults, positionResults, mids] = await Promise.all([
        Promise.allSettled(
          addresses.map((a) => getPortfolioHistory(a.address))
        ),
        Promise.allSettled(
          addresses.map(async (a) => {
            try {
              const positions = await getAllPositions(a.address);
              console.log(`[hlbot] positions for ${a.address.slice(0, 10)}:`, positions.length, positions.map(p => p.coin));
              return positions.map((p) => ({ ...p, wallet: a.address } as WalletPosition));
            } catch (posErr) {
              console.error(`[hlbot] Failed to fetch positions for ${a.address.slice(0,10)}:`, posErr);
              throw posErr;
            }
          })
        ),
        getAllMids().catch(() => ({} as Record<string, string>)),
      ]);

      setMidPrices(mids);

      // Portfolio volume & PnL
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
      const allPositions: WalletPosition[] = [];
      const errors: string[] = [];
      for (const r of positionResults) {
        if (r.status === "fulfilled") {
          allPositions.push(...r.value);
        } else {
          console.error("[hlbot] Position fetch rejected:", r.reason);
          errors.push(String(r.reason));
        }
      }
      setPositions(allPositions);
      setPositionError(errors.length > 0 ? errors.join("; ") : null);
      setLoading(false);
      setCountdown(60);
    } catch (err) {
      console.error("Failed to fetch fast data:", err);
      setPositionError(String(err));
      setLoading(false);
    }
  }, [addresses]);

  // Phase 2: Slow data - all fills for coin breakdown (runs once)
  const fetchFills = useCallback(async () => {
    if (addresses.length === 0) {
      setAllTimeFills([]);
      setFillsLoading(false);
      return;
    }

    setFillsLoading(true);
    try {
      const results = await Promise.allSettled(
        addresses.map(async (a) => {
          const f = await getAllUserFills(a.address, ALL_TIME_START, undefined, 50);
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
      setAllTimeFills(allFills);
      fillsLoaded.current = true;
    } catch (err) {
      console.error("Failed to fetch fills:", err);
    }
    setFillsLoading(false);
  }, [addresses]);

  // Initial load: Phase 1 first, then Phase 2 (prevents 429 rate limiting)
  useEffect(() => {
    fillsLoaded.current = false;
    setLoading(true);
    setFillsLoading(true);
    setHeaderReady(false);
    fetchFastData().then(() => {
      fetchFills();
    });
  }, [fetchFastData, fetchFills]);

  // Auto-refresh: only fast data every 60s
  useEffect(() => {
    const interval = setInterval(fetchFastData, 60_000);
    return () => clearInterval(interval);
  }, [fetchFastData]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fees calculated from fills
  const { totalFees, totalBuilderFees } = useMemo(() => {
    let fees = 0;
    let builderFees = 0;
    for (const f of allTimeFills) {
      fees += parseFloat(f.fee);
      builderFees += parseFloat(f.builderFee || "0");
    }
    return { totalFees: fees, totalBuilderFees: builderFees };
  }, [allTimeFills]);

  // Coin breakdown
  const allTimeFiltered = allTimeFills.filter((f) => {
    if (filterAddress !== "all" && f.wallet.toLowerCase() !== filterAddress.toLowerCase())
      return false;
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

  // Add "Other" row so coin breakdown total matches All-Time Volume
  const fillVolume = coinSummaries.reduce((sum, c) => sum + c.volume, 0);
  const fillPnl = coinSummaries.reduce((sum, c) => sum + c.pnl, 0);
  const fillFees = coinSummaries.reduce((sum, c) => sum + c.fees, 0);
  const otherVolume = portfolioVolume - fillVolume;

  const coinSummariesWithOther = useMemo(() => {
    if (!fillsLoading && otherVolume > 1 && coinSummaries.length > 0) {
      return [
        ...coinSummaries,
        { coin: "Other (liquidations, etc.)", trades: 0, volume: otherVolume, pnl: portfolioPnl - fillPnl, fees: 0 },
      ];
    }
    return coinSummaries;
  }, [coinSummaries, fillsLoading, otherVolume, portfolioPnl, fillPnl]);

  // Filtered positions
  const filteredPositions = positions.filter((p) => {
    if (filterCoin !== "all" && p.coin !== filterCoin) return false;
    if (filterAddress !== "all" && p.wallet.toLowerCase() !== filterAddress.toLowerCase())
      return false;
    return true;
  });

  // Total position stats
  const totalPositionValue = filteredPositions.reduce(
    (sum, p) => sum + Math.abs(parseFloat(p.positionValue)),
    0
  );
  const totalUPnl = filteredPositions.reduce(
    (sum, p) => sum + parseFloat(p.unrealizedPnl),
    0
  );

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return "\u21D5";
    return sortDir === "asc" ? "\u2191" : "\u2193";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
          Trade History
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-hl-text-tertiary font-mono tabular-nums">
            {countdown}s
          </span>
          <button
            onClick={() => {
              fetchFastData();
              if (!fillsLoaded.current) fetchFills();
            }}
            disabled={loading}
            className="px-4 py-2 bg-hl-bg-tertiary border border-hl-border rounded-lg text-xs font-medium text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light transition-colors disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* All-Time Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard title="All-Time Volume" value={formatUsd(portfolioVolume)} loading={!headerReady} />
        <StatCard title="All-Time PnL" value={formatUsd(portfolioPnl)} loading={!headerReady} />
        <StatCard
          title="All-Time Fees"
          value={formatUsd(totalFees + totalBuilderFees)}
          subtitle={totalBuilderFees > 0 ? `Builder ${formatUsd(totalBuilderFees)}` : undefined}
          loading={fillsLoading}
        />
        <StatCard title="Active Positions" value={`${positions.length}`} loading={loading} />
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
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Active Positions (Hyperscan style) */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-hl-text-primary">
            Active Positions
            {filteredPositions.length > 0 && (
              <span className="text-xs text-hl-text-tertiary font-normal ml-2">
                {filteredPositions.length} position{filteredPositions.length !== 1 ? "s" : ""}
              </span>
            )}
          </h2>
          {filteredPositions.length > 0 && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-hl-text-tertiary">
                Value: <span className="text-hl-text-primary font-mono">{formatUsd(totalPositionValue)}</span>
              </span>
              <span className="text-hl-text-tertiary">
                uPnL: <span className={`font-mono ${pnlColor(totalUPnl)}`}>{formatUsd(totalUPnl)}</span>
              </span>
            </div>
          )}
        </div>
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-hl-border">
                  {[
                    { label: "Token", align: "text-left" },
                    { label: "Side", align: "text-center" },
                    { label: "Lev.", align: "text-center" },
                    { label: "Value", align: "text-right" },
                    { label: "Amount", align: "text-right" },
                    { label: "Entry", align: "text-right" },
                    { label: "Price", align: "text-right" },
                    { label: "PnL", align: "text-right" },
                    { label: "Funding", align: "text-right" },
                    { label: "Liq.", align: "text-right" },
                  ].map((col) => (
                    <th
                      key={col.label}
                      className={`px-3 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider ${col.align}`}
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
                      {Array.from({ length: 10 }).map((_, j) => (
                        <td key={j} className="px-3 py-3">
                          <div className="skeleton h-4 w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredPositions.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-sm text-hl-text-tertiary">
                      {positionError ? (
                        <div>
                          <div className="text-hl-red mb-1">Failed to load positions</div>
                          <div className="text-xs opacity-60">{positionError}</div>
                        </div>
                      ) : (
                        "No active positions."
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredPositions.map((p) => {
                    const size = parseFloat(p.szi);
                    const isLong = size > 0;
                    const upnl = safeNum(parseFloat(p.unrealizedPnl));
                    const posValue = Math.abs(parseFloat(p.positionValue));
                    const entryPx = p.entryPx ? parseFloat(p.entryPx) : 0;
                    const currentPx = midPrices[p.coin] ? parseFloat(midPrices[p.coin]) : 0;
                    const funding = safeNum(parseFloat(p.cumFunding.sinceOpen));
                    const liqPx = p.liquidationPx ? parseFloat(p.liquidationPx) : 0;
                    const levType = p.leverage.type === "isolated" ? "iso" : "cross";
                    const addrLabel = addresses.find(
                      (a) => a.address.toLowerCase() === p.wallet.toLowerCase()
                    )?.label;

                    return (
                      <tr
                        key={`${p.wallet}-${p.coin}`}
                        className="border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors"
                      >
                        {/* Token */}
                        <td className="px-3 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-hl-text-primary">{p.coin}</span>
                            {addresses.length > 1 && (
                              <span className="text-[10px] text-hl-text-tertiary">{addrLabel || formatAddress(p.wallet)}</span>
                            )}
                          </div>
                        </td>
                        {/* Side */}
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-1 rounded text-xs font-bold ${
                              isLong
                                ? "bg-hl-green/15 text-hl-green"
                                : "bg-hl-red/15 text-hl-red"
                            }`}
                          >
                            {isLong ? "LONG" : "SHORT"}
                          </span>
                        </td>
                        {/* Leverage */}
                        <td className="px-3 py-3 text-center">
                          <div className="flex flex-col items-center">
                            <span className="text-sm font-mono text-hl-yellow font-medium">
                              {p.leverage.value}x
                            </span>
                            <span className="text-[10px] text-hl-text-tertiary">{levType}</span>
                          </div>
                        </td>
                        {/* Value */}
                        <td className="px-3 py-3 text-right text-sm font-mono font-medium text-hl-text-primary">
                          {formatUsd(posValue)}
                        </td>
                        {/* Amount */}
                        <td className={`px-3 py-3 text-right text-sm font-mono ${isLong ? "text-hl-green" : "text-hl-red"}`}>
                          {size.toFixed(4)}
                        </td>
                        {/* Entry */}
                        <td className="px-3 py-3 text-right text-sm font-mono text-hl-text-primary">
                          {entryPx > 0 ? `$${formatPrice(entryPx)}` : "-"}
                        </td>
                        {/* Current Price */}
                        <td className="px-3 py-3 text-right text-sm font-mono text-hl-text-secondary">
                          {currentPx > 0 ? `$${formatPrice(currentPx)}` : "-"}
                        </td>
                        {/* PnL */}
                        <td className={`px-3 py-3 text-right text-sm font-mono font-medium ${pnlColor(upnl)}`}>
                          {formatUsd(upnl)}
                        </td>
                        {/* Funding */}
                        <td className={`px-3 py-3 text-right text-sm font-mono ${pnlColor(funding)}`}>
                          {formatUsd(funding)}
                        </td>
                        {/* Liq */}
                        <td className="px-3 py-3 text-right text-sm font-mono text-hl-text-tertiary">
                          {liqPx > 0 ? `$${formatPrice(liqPx)}` : "-"}
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

      {/* Coin Breakdown */}
      <div>
        <button
          onClick={() => setShowSummary(!showSummary)}
          className="flex items-center gap-2 text-lg font-semibold text-hl-text-primary mb-4"
        >
          Coin Breakdown
          <span className="text-xs text-hl-text-tertiary">
            {showSummary ? "\u25BC" : "\u25B6"}{" "}
            {fillsLoading ? "loading..." : `${coinSummaries.length} pairs`}
          </span>
        </button>
        {showSummary &&
          (fillsLoading ? (
            <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-8 text-center">
              <div className="text-sm text-hl-text-tertiary">Loading coin breakdown...</div>
            </div>
          ) : coinSummariesWithOther.length > 0 ? (
            <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px]">
                  <thead>
                    <tr className="border-b border-hl-border">
                      {([
                        { key: "coin" as SortKey, label: "Coin", align: "text-left" },
                        { key: "trades" as SortKey, label: "Trades", align: "text-right" },
                        { key: "volume" as SortKey, label: "Volume", align: "text-right" },
                        { key: "pnl" as SortKey, label: "Closed PnL", align: "text-right" },
                        { key: "fees" as SortKey, label: "Fees", align: "text-right" },
                      ] as const).map((col) => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          className={`px-4 py-3 text-xs font-medium text-hl-text-tertiary uppercase tracking-wider ${col.align} cursor-pointer hover:text-hl-accent transition-colors select-none`}
                        >
                          {col.label}{" "}
                          <span className="text-hl-accent">{sortIcon(col.key)}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {coinSummariesWithOther.map((c) => {
                      const isOther = c.coin.startsWith("Other");
                      return (
                        <tr
                          key={c.coin}
                          onClick={() => !isOther && setFilterCoin(filterCoin === c.coin ? "all" : c.coin)}
                          className={`border-b border-hl-border/50 transition-colors ${
                            isOther ? "opacity-60 italic" : "hover:bg-hl-bg-hover/50 cursor-pointer"
                          } ${filterCoin === c.coin ? "bg-hl-accent/10" : ""}`}
                        >
                          <td className={`px-4 py-3 text-sm font-medium ${isOther ? "text-hl-text-tertiary" : "text-hl-text-primary"}`}>
                            {c.coin}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-secondary">
                            {isOther ? "-" : c.trades.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                            {formatUsd(c.volume)}
                          </td>
                          <td className={`px-4 py-3 text-right text-sm font-mono ${pnlColor(c.pnl)}`}>
                            {formatUsd(c.pnl)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                            {isOther ? "-" : formatUsd(c.fees)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-8 text-center">
              <div className="text-sm text-hl-text-tertiary">No trade history found.</div>
            </div>
          ))}
      </div>
    </div>
  );
}
