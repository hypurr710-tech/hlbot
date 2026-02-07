"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAddresses } from "@/lib/store";
import { getUserFills, Fill } from "@/lib/hyperliquid";
import { formatUsd, formatAddress } from "@/lib/format";
import StatCard from "@/components/StatCard";

interface CoinFeeBreakdown {
  coin: string;
  volume: number;
  fees: number;
  builderFees: number;
  trades: number;
  avgFeeRate: number;
}

interface AddressFeeBreakdown {
  address: string;
  label: string;
  tradingFees: number;
  builderFees: number;
  totalFees: number;
  volume: number;
  trades: number;
}

function safeNum(val: number): number {
  return isNaN(val) ? 0 : val;
}

export default function FeesPage() {
  const { addresses } = useAddresses();
  const [coinBreakdown, setCoinBreakdown] = useState<CoinFeeBreakdown[]>([]);
  const [addressBreakdown, setAddressBreakdown] = useState<AddressFeeBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);

  const fetchData = useCallback(async () => {
    if (addresses.length === 0) {
      setCoinBreakdown([]);
      setAddressBreakdown([]);
      setLoading(false);
      return;
    }
    if (!hasLoadedOnce.current) setLoading(true);
    try {
      const results = await Promise.allSettled(
        addresses.map(async (a) => {
          const fills = await getUserFills(a.address);
          return { address: a.address, label: a.label, fills };
        })
      );

      const successful = results
        .filter(
          (r): r is PromiseFulfilledResult<{
            address: string;
            label: string;
            fills: Fill[];
          }> => r.status === "fulfilled"
        )
        .map((r) => r.value);

      // Coin breakdown
      const coinMap = new Map<string, CoinFeeBreakdown>();
      for (const { fills } of successful) {
        for (const fill of fills) {
          const existing = coinMap.get(fill.coin) || {
            coin: fill.coin,
            volume: 0,
            fees: 0,
            builderFees: 0,
            trades: 0,
            avgFeeRate: 0,
          };
          const notional = safeNum(parseFloat(fill.px) * parseFloat(fill.sz));
          existing.volume += notional;
          existing.fees += safeNum(parseFloat(fill.fee));
          existing.builderFees += safeNum(parseFloat(fill.builderFee || "0"));
          existing.trades += 1;
          coinMap.set(fill.coin, existing);
        }
      }
      const coinArr = Array.from(coinMap.values())
        .map((c) => ({
          ...c,
          avgFeeRate: c.volume > 0 ? (c.fees / c.volume) * 100 : 0,
        }))
        .sort((a, b) => b.fees - a.fees);
      setCoinBreakdown(coinArr);

      // Address breakdown
      const addrArr: AddressFeeBreakdown[] = successful.map(
        ({ address, label, fills }) => {
          let tradingFees = 0;
          let builderFees = 0;
          let volume = 0;
          for (const fill of fills) {
            tradingFees += safeNum(parseFloat(fill.fee));
            builderFees += safeNum(parseFloat(fill.builderFee || "0"));
            volume += safeNum(parseFloat(fill.px) * parseFloat(fill.sz));
          }
          return {
            address,
            label,
            tradingFees,
            builderFees,
            totalFees: tradingFees + builderFees,
            volume,
            trades: fills.length,
          };
        }
      );
      setAddressBreakdown(addrArr.sort((a, b) => b.totalFees - a.totalFees));
      hasLoadedOnce.current = true;
    } catch (err) {
      console.error("Failed to fetch fee data:", err);
    }
    setLoading(false);
  }, [addresses]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totals = addressBreakdown.reduce(
    (acc, a) => ({
      tradingFees: acc.tradingFees + a.tradingFees,
      builderFees: acc.builderFees + a.builderFees,
      totalFees: acc.totalFees + a.totalFees,
      volume: acc.volume + a.volume,
      trades: acc.trades + a.trades,
    }),
    { tradingFees: 0, builderFees: 0, totalFees: 0, volume: 0, trades: 0 }
  );

  const effectiveFeeRate =
    totals.volume > 0 ? (totals.tradingFees / totals.volume) * 100 : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-hl-text-primary">
            수수료 현황
          </h1>
          <p className="text-sm text-hl-text-secondary mt-1">
            전체 수수료 내역 (최근 거래 기준)
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="px-4 py-2 bg-hl-bg-tertiary border border-hl-border rounded-lg text-xs font-medium text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light transition-colors disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          title="총 수수료"
          value={formatUsd(totals.totalFees)}
          subtitle={`Trading ${formatUsd(totals.tradingFees)} + Builder ${formatUsd(totals.builderFees)}`}
          loading={loading}
        />
        <StatCard
          title="총 볼륨"
          value={formatUsd(totals.volume)}
          subtitle={`${totals.trades.toLocaleString()} trades`}
          loading={loading}
        />
        <StatCard
          title="평균 수수료율"
          value={`${effectiveFeeRate.toFixed(4)}%`}
          subtitle="Trading fees / Volume"
          loading={loading}
        />
        <StatCard
          title="Builder 수수료"
          value={formatUsd(totals.builderFees)}
          loading={loading}
        />
      </div>

      {/* Per-Address Fees */}
      <div>
        <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
          주소별 수수료
        </h2>
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hl-border">
                  {[
                    { label: "주소", align: "left" },
                    { label: "거래수", align: "right" },
                    { label: "볼륨", align: "right" },
                    { label: "Trading 수수료", align: "right" },
                    { label: "Builder 수수료", align: "right" },
                    { label: "총 수수료", align: "right" },
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
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="skeleton h-4 w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : addressBreakdown.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-hl-text-tertiary"
                    >
                      주소를 추가하면 수수료 내역을 볼 수 있습니다.
                    </td>
                  </tr>
                ) : (
                  addressBreakdown.map((a) => (
                    <tr
                      key={a.address}
                      className="border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-hl-text-primary">
                            {a.label}
                          </span>
                          <span className="text-xs font-mono text-hl-text-tertiary">
                            {formatAddress(a.address)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-secondary">
                        {a.trades.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                        {formatUsd(a.volume)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                        {formatUsd(a.tradingFees)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-red-dim">
                        {formatUsd(a.builderFees)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono font-medium text-hl-red">
                        {formatUsd(a.totalFees)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Per-Coin Fees */}
      <div>
        <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
          코인별 수수료
        </h2>
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hl-border">
                  {[
                    { label: "코인", align: "left" },
                    { label: "거래수", align: "right" },
                    { label: "볼륨", align: "right" },
                    { label: "수수료", align: "right" },
                    { label: "수수료율", align: "right" },
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
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-hl-border/50">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="skeleton h-4 w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : coinBreakdown.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-sm text-hl-text-tertiary"
                    >
                      데이터 없음
                    </td>
                  </tr>
                ) : (
                  coinBreakdown.map((c) => (
                    <tr
                      key={c.coin}
                      className="border-b border-hl-border/50 hover:bg-hl-bg-hover/50 transition-colors"
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
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                        {formatUsd(c.fees + c.builderFees)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-secondary">
                        {c.avgFeeRate.toFixed(4)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
