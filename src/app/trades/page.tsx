"use client";

import { useState, useEffect, useCallback } from "react";
import { useAddresses } from "@/lib/store";
import {
  getAllMids,
  getAllPositions,
  getPortfolioHistory,
  Position,
  PortfolioPeriodData,
} from "@/lib/hyperliquid";
import { formatUsd, pnlColor, formatAddress } from "@/lib/format";
import StatCard from "@/components/StatCard";

interface WalletPosition extends Position {
  wallet: string;
}

function safeNum(val: number | undefined | null): number {
  if (val === undefined || val === null || isNaN(val)) return 0;
  return val;
}

function formatPrice(val: number): string {
  if (val >= 100) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

export default function TradesPage() {
  const { addresses } = useAddresses();
  const [positions, setPositions] = useState<WalletPosition[]>([]);
  const [midPrices, setMidPrices] = useState<Record<string, string>>({});

  const [portfolioVolume, setPortfolioVolume] = useState<number>(0);
  const [portfolioPnl, setPortfolioPnl] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [headerReady, setHeaderReady] = useState(false);
  const [positionError, setPositionError] = useState<string | null>(null);
  const [filterCoin, setFilterCoin] = useState<string>("all");
  const [filterAddress, setFilterAddress] = useState<string>("all");
  const [countdown, setCountdown] = useState(90);

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
      // Fetch mid prices first (lightweight, weight 2)
      const mids = await getAllMids().catch(() => ({} as Record<string, string>));
      setMidPrices(mids);

      // Process each address sequentially to spread requests and avoid rate limit bursts
      const portfolioResults: PromiseSettledResult<Record<string, PortfolioPeriodData>>[] = [];
      const positionResults: PromiseSettledResult<WalletPosition[]>[] = [];

      for (const a of addresses) {
        const [portfolioResult, positionResult] = await Promise.allSettled([
          getPortfolioHistory(a.address),
          (async () => {
            const positions = await getAllPositions(a.address);
            return positions.map((p) => ({ ...p, wallet: a.address } as WalletPosition));
          })(),
        ]);
        portfolioResults.push(portfolioResult);
        positionResults.push(positionResult);
      }

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
      setCountdown(90);
    } catch (err) {
      console.error("Failed to fetch fast data:", err);
      setPositionError(String(err));
      setLoading(false);
    }
  }, [addresses]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setHeaderReady(false);
    fetchFastData();
  }, [fetchFastData]);

  // Auto-refresh: every 90s to stay within rate limits
  useEffect(() => {
    const interval = setInterval(fetchFastData, 90_000);
    return () => clearInterval(interval);
  }, [fetchFastData]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 90 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Coin list from positions
  const coins = [...new Set(positions.map((p) => p.coin))].sort();

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
            onClick={() => fetchFastData()}
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
        <StatCard title="Position Value" value={formatUsd(totalPositionValue)} loading={loading} />
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
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
        {/* Mobile: Card layout */}
        <div className="md:hidden space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 space-y-3">
                <div className="skeleton h-5 w-24" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-3/4" />
              </div>
            ))
          ) : filteredPositions.length === 0 ? (
            <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-8 text-center text-sm text-hl-text-tertiary">
              {positionError ? (
                <div>
                  <div className="text-hl-red mb-1">Failed to load positions</div>
                  <div className="text-xs opacity-60">{positionError}</div>
                </div>
              ) : (
                "No active positions."
              )}
            </div>
          ) : (
            filteredPositions.map((p) => {
              const size = parseFloat(p.szi);
              const isLong = size > 0;
              const upnl = safeNum(parseFloat(p.unrealizedPnl));
              const posValue = Math.abs(parseFloat(p.positionValue));
              const entryPx = p.entryPx ? parseFloat(p.entryPx) : 0;
              const currentPx = midPrices[p.coin] ? parseFloat(midPrices[p.coin]) : 0;
              const funding = safeNum(-parseFloat(p.cumFunding.sinceOpen));
              const liqPx = p.liquidationPx ? parseFloat(p.liquidationPx) : 0;
              const levType = p.leverage.type === "isolated" ? "iso" : "cross";
              const addrLabel = addresses.find(
                (a) => a.address.toLowerCase() === p.wallet.toLowerCase()
              )?.label;

              return (
                <div
                  key={`mobile-${p.wallet}-${p.coin}`}
                  className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 space-y-3"
                >
                  {/* Top row: Token, Side, Leverage */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-hl-text-primary">{p.coin}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          isLong
                            ? "bg-hl-green/15 text-hl-green"
                            : "bg-hl-red/15 text-hl-red"
                        }`}
                      >
                        {isLong ? "LONG" : "SHORT"}
                      </span>
                      <span className="text-xs font-mono text-hl-yellow font-medium">
                        {p.leverage.value}x<span className="text-hl-text-tertiary ml-0.5">{levType}</span>
                      </span>
                    </div>
                    <span className={`text-sm font-mono font-semibold ${pnlColor(upnl)}`}>
                      {formatUsd(upnl)}
                    </span>
                  </div>

                  {/* Wallet label (multi-address) */}
                  {addresses.length > 1 && (
                    <div className="text-[11px] text-hl-text-tertiary -mt-1">
                      {addrLabel || formatAddress(p.wallet)}
                    </div>
                  )}

                  {/* Data grid */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-hl-text-tertiary">Value</span>
                      <span className="font-mono text-hl-text-primary">{formatUsd(posValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hl-text-tertiary">Amount</span>
                      <span className={`font-mono ${isLong ? "text-hl-green" : "text-hl-red"}`}>
                        {size.toFixed(4)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hl-text-tertiary">Entry</span>
                      <span className="font-mono text-hl-text-primary">
                        {entryPx > 0 ? `$${formatPrice(entryPx)}` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hl-text-tertiary">Price</span>
                      <span className="font-mono text-hl-text-secondary">
                        {currentPx > 0 ? `$${formatPrice(currentPx)}` : "-"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hl-text-tertiary">Funding</span>
                      <span className={`font-mono ${pnlColor(funding)}`}>{formatUsd(funding)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-hl-text-tertiary">Liq.</span>
                      <span className="font-mono text-hl-text-tertiary">
                        {liqPx > 0 ? `$${formatPrice(liqPx)}` : "-"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop: Table layout */}
        <div className="hidden md:block bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
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
                    const funding = safeNum(-parseFloat(p.cumFunding.sinceOpen));
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

      {/* Hypurrscan Explorer */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          {/* Purr logo */}
          <img src="/purr-avatar.png" alt="Purr" className="w-8 h-8 rounded-lg shrink-0" />
          <div>
            <h2 className="text-lg font-semibold gradient-text">Hypurrscan Explorer</h2>
            <p className="text-[11px] text-hl-text-tertiary">View detailed analytics on hypurrscan.io</p>
          </div>
        </div>
        <div className="grid gap-3">
          {addresses.map((a) => {
            const addrLower = a.address.toLowerCase();
            const tabs = [
              { label: "Perps", hash: "#perps" },
              { label: "Transactions", hash: "#transactions" },
              { label: "Holdings", hash: "#holdings" },
              { label: "Orders", hash: "#orders" },
              { label: "Vaults", hash: "#vaults" },
              { label: "Staking", hash: "#staking" },
            ];
            return (
              <div
                key={a.address}
                className="bg-hl-bg-secondary border border-hl-green/20 rounded-xl overflow-hidden hover:border-hl-green/40 transition-colors"
              >
                {/* Green accent top bar */}
                <div className="h-[2px] bg-gradient-to-r from-hl-green/60 via-hl-green to-hl-green/60" />
                <div className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-5 h-5 rounded-full bg-hl-green/15 flex items-center justify-center shrink-0">
                        <div className="w-2 h-2 rounded-full bg-hl-green" />
                      </div>
                      <span className="text-sm font-medium text-hl-text-primary truncate">{a.label}</span>
                      <span className="text-xs font-mono text-hl-text-tertiary shrink-0">
                        {formatAddress(a.address)}
                      </span>
                    </div>
                    <a
                      href={`https://hypurrscan.io/address/${addrLower}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-hl-green/10 text-xs font-medium text-hl-green hover:bg-hl-green/20 transition-colors self-start sm:self-auto shrink-0"
                    >
                      Open Explorer
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 3h7v7M13 3L6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </a>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                      <a
                        key={tab.hash}
                        href={`https://hypurrscan.io/address/${addrLower}${tab.hash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-hl-bg-tertiary border border-hl-border rounded-lg text-xs text-hl-text-secondary hover:text-hl-green hover:border-hl-green/40 hover:bg-hl-green/5 transition-all"
                      >
                        {tab.label}
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {addresses.length === 0 && (
            <div className="bg-hl-bg-secondary border border-hl-green/20 rounded-xl p-8 text-center">
              <div className="text-sm text-hl-text-tertiary">
                No addresses configured. Add one in the Address page.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
