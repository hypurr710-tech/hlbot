"use client";
import { useMemo } from "react";
import { useArbPairs } from "@/hooks/useArbPairs";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { calcCapitalUsd, calcRealizedAprPct, calcAprPct } from "@/lib/arb";
import { formatUsd } from "@/lib/format";
import StatCard from "@/components/StatCard";

interface Props {
  snapshot: LiveSnapshot | null;
  hlPositionsBySymbol: Record<string, { sizeAbs: number; cumFundingUsd: number }>;
  /** keyed by pair id → per-pair realized totals from userFunding events */
  pairRealizedFunding: Record<string, { totalFundingUsd: number; elapsedHours: number }>;
}

export default function SummaryStrip({ snapshot, hlPositionsBySymbol, pairRealizedFunding }: Props) {
  const { pairs } = useArbPairs();

  const totals = useMemo(() => {
    if (!snapshot || snapshot.fx.usdKrwHana == null) {
      return { totalCapital: 0, blendedRealizedApr: 0, blendedProjectedApr: 0, totalFunding: 0 };
    }
    let totalCapital = 0;
    let weightedRealizedApr = 0;
    let weightedProjectedApr = 0;
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
      const realized = pairRealizedFunding[p.id] ?? { totalFundingUsd: 0, elapsedHours: 0 };
      const realizedApr = calcRealizedAprPct({
        totalFundingUsd: realized.totalFundingUsd,
        capitalUsd: capital,
        elapsedHours: realized.elapsedHours,
      });
      const projectedApr = calcAprPct({
        hlNotionalUsd: pos.sizeAbs * hl.markPx,
        fundingHourly: hl.fundingHourly,
        capitalUsd: capital,
      });
      totalCapital += capital;
      weightedRealizedApr += realizedApr * capital;
      weightedProjectedApr += projectedApr * capital;
      totalFunding += realized.totalFundingUsd;
    }
    return {
      totalCapital,
      blendedRealizedApr: totalCapital > 0 ? weightedRealizedApr / totalCapital : 0,
      blendedProjectedApr: totalCapital > 0 ? weightedProjectedApr / totalCapital : 0,
      totalFunding,
    };
  }, [pairs, snapshot, hlPositionsBySymbol, pairRealizedFunding]);

  const usdtPrem =
    snapshot?.fx.usdtKrwUpbit != null && snapshot?.fx.usdKrwHana != null
      ? ((snapshot.fx.usdtKrwUpbit - snapshot.fx.usdKrwHana) / snapshot.fx.usdKrwHana) * 100
      : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <StatCard
        title="Realized Funding"
        value={formatUsd(totals.totalFunding)}
        subtitle="userFunding since open"
        loading={!snapshot}
      />
      <StatCard
        title="Realized APR"
        value={`${totals.blendedRealizedApr.toFixed(1)}%`}
        subtitle={`Est. ${totals.blendedProjectedApr.toFixed(1)}% at current rate`}
        loading={!snapshot}
      />
      <StatCard
        title="Capital Deployed"
        value={formatUsd(totals.totalCapital)}
        subtitle="HL notional + KR spot"
        loading={!snapshot}
      />
      <StatCard
        title="USDT 김프"
        value={usdtPrem != null ? `${usdtPrem >= 0 ? "+" : ""}${usdtPrem.toFixed(2)}%` : "—"}
        subtitle={
          snapshot?.fx.usdtKrwUpbit != null && snapshot?.fx.usdKrwHana != null
            ? `Upbit ₩${snapshot.fx.usdtKrwUpbit.toLocaleString("ko-KR")} · 하나 ₩${snapshot.fx.usdKrwHana.toLocaleString("ko-KR")}`
            : "Upbit vs 하나은행"
        }
        loading={!snapshot}
      />
    </div>
  );
}
