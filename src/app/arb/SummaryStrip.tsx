"use client";
import { useMemo } from "react";
import { useArbPairs } from "@/hooks/useArbPairs";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { calcCapitalUsd, calcAprPct } from "@/lib/arb";
import { formatUsd } from "@/lib/format";
import StatCard from "@/components/StatCard";

interface Props {
  snapshot: LiveSnapshot | null;
  hlPositionsBySymbol: Record<string, { sizeAbs: number; cumFundingUsd: number }>;
}

export default function SummaryStrip({ snapshot, hlPositionsBySymbol }: Props) {
  const { pairs } = useArbPairs();

  const totals = useMemo(() => {
    if (!snapshot || snapshot.fx.usdKrwHana == null) {
      return { totalCapital: 0, blendedApr: 0, totalFunding: 0 };
    }
    let totalCapital = 0;
    let weightedApr = 0;
    let totalFunding = 0;
    for (const p of pairs) {
      if (p.closedAt) continue;
      const key = `${p.hlAddress.toLowerCase()}|${p.hlSymbol}`;
      const pos = hlPositionsBySymbol[key];
      const hl = snapshot.hl[p.hlSymbol];
      if (!pos || !hl) continue;
      const capital = calcCapitalUsd({
        hlSizeAbs: pos.sizeAbs,
        hlMarkUsd: hl.markPx,
        krQuantity: p.krLeg.quantity,
        krAvgPriceKrw: p.krLeg.avgPriceKrw,
        usdKrwHana: snapshot.fx.usdKrwHana!,
      });
      const apr = calcAprPct({
        hlNotionalUsd: pos.sizeAbs * hl.markPx,
        fundingHourly: hl.fundingHourly,
        capitalUsd: capital,
      });
      totalCapital += capital;
      weightedApr += apr * capital;
      totalFunding += pos.cumFundingUsd;
    }
    return {
      totalCapital,
      blendedApr: totalCapital > 0 ? weightedApr / totalCapital : 0,
      totalFunding,
    };
  }, [pairs, snapshot, hlPositionsBySymbol]);

  const usdtPrem =
    snapshot?.fx.usdtKrwUpbit != null && snapshot?.fx.usdKrwHana != null
      ? ((snapshot.fx.usdtKrwUpbit - snapshot.fx.usdKrwHana) / snapshot.fx.usdKrwHana) * 100
      : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <StatCard title="Total Funding" value={formatUsd(totals.totalFunding)}
        subtitle="Realized since open" loading={!snapshot} />
      <StatCard title="Blended APR" value={`${totals.blendedApr.toFixed(1)}%`}
        subtitle="Weighted by capital" loading={!snapshot} />
      <StatCard title="Capital Deployed" value={formatUsd(totals.totalCapital)}
        subtitle="HL notional + KR spot" loading={!snapshot} />
      <StatCard title="USDT 김프"
        value={usdtPrem != null ? `${usdtPrem >= 0 ? "+" : ""}${usdtPrem.toFixed(2)}%` : "—"}
        subtitle="Upbit vs 하나은행" loading={!snapshot} />
    </div>
  );
}
