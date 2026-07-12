"use client";
import { useMemo } from "react";
import { useArbPairs } from "@/hooks/useArbPairs";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { calcCapitalForBasis, calcRealizedAprPct, calcAprPct, type AprBasis } from "@/lib/arb";
import { formatUsd } from "@/lib/format";
import { useAprBasis, APR_BASIS_LABEL } from "@/lib/aprBasis";
import StatCard from "@/components/StatCard";

interface Props {
  snapshot: LiveSnapshot | null;
  hlPositionsBySymbol: Record<string, { sizeAbs: number; cumFundingUsd: number }>;
  /** keyed by pair id → per-pair realized totals from userFunding events */
  pairRealizedFunding: Record<string, { totalFundingUsd: number; elapsedHours: number }>;
}

export default function SummaryStrip({ snapshot, hlPositionsBySymbol, pairRealizedFunding }: Props) {
  const { pairs } = useArbPairs();
  const { basis, setBasis } = useAprBasis();

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
      const capital = calcCapitalForBasis({
        hlSizeAbs: pos.sizeAbs,
        hlMarkUsd: hl.markPx,
        krQuantity: p.krLeg.quantity,
        krAvgPriceKrw: p.krLeg.avgPriceKrw,
        usdKrwHana: snapshot.fx.usdKrwHana!,
        basis,
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
  }, [pairs, snapshot, hlPositionsBySymbol, pairRealizedFunding, basis]);

  const usdtPrem =
    snapshot?.fx.usdtKrwUpbit != null && snapshot?.fx.usdKrwHana != null
      ? ((snapshot.fx.usdtKrwUpbit - snapshot.fx.usdKrwHana) / snapshot.fx.usdKrwHana) * 100
      : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span
          className="text-[11px] text-hl-text-tertiary uppercase tracking-wider cursor-help"
          title="APR·수익률의 분모(자본) 기준 — 전체자본: HL 노셔널+국내 현물, HL 자본만: 하이퍼리퀴드만(HL 전용 트래커와 비교용, 더 높게 나옴)"
        >
          APR 기준
        </span>
        <div className="flex rounded-lg overflow-hidden border border-hl-border">
          {(["full", "hl"] as AprBasis[]).map((b) => (
            <button
              key={b}
              onClick={() => setBasis(b)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                basis === b
                  ? "bg-hl-accent/20 text-hl-accent"
                  : "text-hl-text-secondary hover:bg-hl-bg-hover"
              }`}
            >
              {APR_BASIS_LABEL[b]}
            </button>
          ))}
        </div>
      </div>
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
          subtitle={`${APR_BASIS_LABEL[basis]} 기준 · 예상 ${totals.blendedProjectedApr.toFixed(1)}%`}
          loading={!snapshot}
        />
        <StatCard
          title="Capital Deployed"
          value={formatUsd(totals.totalCapital)}
          subtitle={basis === "hl" ? "HL 노셔널만" : "HL notional + KR spot"}
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
    </div>
  );
}
