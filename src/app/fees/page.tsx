"use client";

import { useState, useEffect, useCallback } from "react";
import { useAddresses } from "@/lib/store";
import { getUserFills, getUserFunding, Fill, FundingEntry } from "@/lib/hyperliquid";
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
  fundingPaid: number;
  fundingReceived: number;
  netFunding: number;
  totalCost: number;
  volume: number;
}

export default function FeesPage() {
  const { addresses } = useAddresses();
  const [coinBreakdown, setCoinBreakdown] = useState<CoinFeeBreakdown[]>([]);
  const [addressBreakdown, setAddressBreakdown] = useState<AddressFeeBreakdown[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (addresses.length === 0) {
      setCoinBreakdown([]);
      setAddressBreakdown([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const results = await Promise.allSettled(
        addresses.map(async (a) => {
          const [fills, funding] = await Promise.all([
            getUserFills(a.address, thirtyDaysAgo),
            getUserFunding(a.address, thirtyDaysAgo),
          ]);
          return { address: a.address, label: a.label, fills, funding };
        })
      );

      const successful = results
        .filter(
          (
            r
          ): r is PromiseFulfilledResult<{
            address: string;
            label: string;
            fills: Fill[];
            funding: FundingEntry[];
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
          const notional = parseFloat(fill.px) * parseFloat(fill.sz);
          existing.volume += notional;
          existing.fees += parseFloat(fill.fee);
          existing.builderFees += parseFloat(fill.builderFee || "0");
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
        ({ address, label, fills, funding }) => {
          let tradingFees = 0;
          let builderFees = 0;
          let volume = 0;
          for (const fill of fills) {
            tradingFees += parseFloat(fill.fee);
            builderFees += parseFloat(fill.builderFee || "0");
            volume += parseFloat(fill.px) * parseFloat(fill.sz);
          }

          let fundingPaid = 0;
          let fundingReceived = 0;
          for (const f of funding) {
            const usdc = parseFloat(f.usdc);
            if (usdc >= 0) fundingReceived += usdc;
            else fundingPaid += Math.abs(usdc);
          }

          return {
            address,
            label,
            tradingFees,
            builderFees,
            fundingPaid,
            fundingReceived,
            netFunding: fundingReceived - fundingPaid,
            totalCost: tradingFees + builderFees + fundingPaid - fundingReceived,
            volume,
          };
        }
      );
      setAddressBreakdown(addrArr.sort((a, b) => b.totalCost - a.totalCost));
    } catch (err) {
      console.error("Failed to fetch fee data:", err);
    }
    setLoading(false);
  }, [addresses]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totals = addressBreakdown.reduce(
    (acc, a) => ({
      tradingFees: acc.tradingFees + a.tradingFees,
      builderFees: acc.builderFees + a.builderFees,
      fundingPaid: acc.fundingPaid + a.fundingPaid,
      fundingReceived: acc.fundingReceived + a.fundingReceived,
      totalCost: acc.totalCost + a.totalCost,
      volume: acc.volume + a.volume,
    }),
    {
      tradingFees: 0,
      builderFees: 0,
      fundingPaid: 0,
      fundingReceived: 0,
      totalCost: 0,
      volume: 0,
    }
  );

  const effectiveFeeRate =
    totals.volume > 0 ? (totals.tradingFees / totals.volume) * 100 : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-hl-text-primary">
            Fees & Costs
          </h1>
          <p className="text-sm text-hl-text-secondary mt-1">
            30-day fee breakdown across all addresses
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
      <div className="grid grid-cols-5 gap-4">
        <StatCard
          title="Trading Fees"
          value={formatUsd(totals.tradingFees)}
          loading={loading}
        />
        <StatCard
          title="Builder Fees"
          value={formatUsd(totals.builderFees)}
          loading={loading}
        />
        <StatCard
          title="Funding Paid"
          value={formatUsd(totals.fundingPaid)}
          loading={loading}
        />
        <StatCard
          title="Funding Received"
          value={formatUsd(totals.fundingReceived)}
          loading={loading}
        />
        <StatCard
          title="Effective Fee Rate"
          value={`${effectiveFeeRate.toFixed(4)}%`}
          subtitle={`${formatUsd(totals.volume)} volume`}
          loading={loading}
        />
      </div>

      {/* Total cost banner */}
      {!loading && (
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-medium text-hl-text-secondary uppercase tracking-wider">
                Total Net Cost (30d)
              </span>
              <p className="text-xs text-hl-text-tertiary mt-1">
                Trading Fees + Builder Fees + Net Funding
              </p>
            </div>
            <span
              className={`text-3xl font-semibold font-mono ${
                totals.totalCost > 0 ? "text-hl-red" : "text-hl-green"
              }`}
            >
              {totals.totalCost > 0 ? "-" : "+"}
              {formatUsd(Math.abs(totals.totalCost))}
            </span>
          </div>
        </div>
      )}

      {/* Per-Address Fee Breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
          Per-Address Fees
        </h2>
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hl-border">
                  {[
                    { label: "Address", align: "left" },
                    { label: "Volume", align: "right" },
                    { label: "Trading Fees", align: "right" },
                    { label: "Builder Fees", align: "right" },
                    { label: "Funding Paid", align: "right" },
                    { label: "Funding Recv", align: "right" },
                    { label: "Net Cost", align: "right" },
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
                      {Array.from({ length: 7 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="skeleton h-4 w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : addressBreakdown.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm text-hl-text-tertiary"
                    >
                      No fee data available. Add addresses to track fees.
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
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-text-primary">
                        {formatUsd(a.volume)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                        {formatUsd(a.tradingFees)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-red-dim">
                        {formatUsd(a.builderFees)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-red">
                        {formatUsd(a.fundingPaid)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-green">
                        {formatUsd(a.fundingReceived)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-sm font-mono font-medium ${
                          a.totalCost > 0 ? "text-hl-red" : "text-hl-green"
                        }`}
                      >
                        {a.totalCost > 0 ? "-" : "+"}
                        {formatUsd(Math.abs(a.totalCost))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Per-Coin Fee Breakdown */}
      <div>
        <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
          Per-Coin Fees
        </h2>
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hl-border">
                  {[
                    { label: "Coin", align: "left" },
                    { label: "Trades", align: "right" },
                    { label: "Volume", align: "right" },
                    { label: "Trading Fees", align: "right" },
                    { label: "Builder Fees", align: "right" },
                    { label: "Avg Fee Rate", align: "right" },
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
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="skeleton h-4 w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : coinBreakdown.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-hl-text-tertiary"
                    >
                      No coin fee data available.
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
                        {formatUsd(c.fees)}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-mono text-hl-red-dim">
                        {formatUsd(c.builderFees)}
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
