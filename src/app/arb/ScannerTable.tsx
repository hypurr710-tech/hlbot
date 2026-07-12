"use client";
import { useMemo, useState } from "react";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { loadTickerMap } from "@/lib/tickerMap";
import { calcPremiumPct, calcAprPct, calcCapitalUsd } from "@/lib/arb";
import { pnlColor } from "@/lib/format";

type SortKey = "apr" | "premium" | "funding";

interface Row {
  hlSymbol: string;
  krName: string;
  markPx: number;
  krCloseKrw: number;
  premiumPct: number;
  aprPct: number;
  fundingHourly: number;
}

interface Props {
  snapshot: LiveSnapshot;
}

const HIDE_BELOW_ABS_PREMIUM_PCT = 0.1;

export default function ScannerTable({ snapshot }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("apr");

  const rows = useMemo<Row[]>(() => {
    const map = loadTickerMap();
    const out: Row[] = [];
    for (const t of map) {
      const hl = snapshot.hl[t.hlSymbol];
      const kr = snapshot.kr[t.hlSymbol];
      if (!hl || !kr || snapshot.fx.usdKrwHana == null || snapshot.fx.usdtKrwUpbit == null) continue;
      const premium = calcPremiumPct({
        hlMarkUsd: hl.markPx, usdtKrw: snapshot.fx.usdtKrwUpbit, krCloseKrw: kr.close,
      });
      if (Math.abs(premium) < HIDE_BELOW_ABS_PREMIUM_PCT) continue;
      const hlSizeAbs = 1;
      const krQuantity = (hl.markPx * snapshot.fx.usdKrwHana) / kr.close;
      const capital = calcCapitalUsd({
        hlSizeAbs, hlMarkUsd: hl.markPx,
        krQuantity, krAvgPriceKrw: kr.close, usdKrwHana: snapshot.fx.usdKrwHana,
      });
      const apr = calcAprPct({
        hlNotionalUsd: hl.markPx, fundingHourly: hl.fundingHourly, capitalUsd: capital,
      });
      out.push({
        hlSymbol: t.hlSymbol,
        krName: t.krName,
        markPx: hl.markPx,
        krCloseKrw: kr.close,
        premiumPct: premium,
        aprPct: apr,
        fundingHourly: hl.fundingHourly,
      });
    }
    return out.sort((a, b) => {
      if (sortKey === "apr") return b.aprPct - a.aprPct;
      if (sortKey === "premium") return b.premiumPct - a.premiumPct;
      return b.fundingHourly - a.fundingHourly;
    });
  }, [snapshot, sortKey]);

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border">
        <p className="text-xs text-hl-text-tertiary leading-relaxed">
          매핑된 종목 중 프리미엄 절대값 ≥ 0.1% 인 것만 표시. APR = 현재 시간당 펀딩률 × 24 × 365 / (HL 노셔널 + KR 현물 원화의 USD 환산).
        </p>
      </div>
      <div className="flex items-center gap-2 p-3 border-b border-hl-border text-xs">
        <span className="text-hl-text-tertiary">Sort by</span>
        {(["apr", "premium", "funding"] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`px-2 py-0.5 rounded font-mono uppercase ${
              sortKey === k
                ? "bg-hl-accent/20 text-hl-accent"
                : "text-hl-text-secondary hover:text-hl-text-primary"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-[11px] text-hl-text-tertiary uppercase tracking-wider">
            <th className="px-4 py-3 text-left">Pair</th>
            <th className="px-4 py-3 text-right">Mark</th>
            <th className="px-4 py-3 text-right">Spot</th>
            <th className="px-4 py-3 text-right">Prem</th>
            <th className="px-4 py-3 text-right">
              <span title="현재 펀딩비가 유지된다고 가정한 연 수익률 (분모=HL 마진 + KR 현물 원화의 USD 환산)">
                APR<span className="text-hl-text-tertiary ml-0.5">?</span>
              </span>
            </th>
            <th className="px-4 py-3 text-right">24h Fund</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="p-6 text-center text-hl-text-tertiary text-xs">
              No mapped tickers with premium ≥ 0.1%.
            </td></tr>
          ) : rows.map((r) => (
            <tr key={r.hlSymbol} className="border-t border-hl-border/50 hover:bg-hl-bg-hover/50">
              <td className="px-4 py-3">
                <div className="font-semibold text-hl-text-primary">{r.hlSymbol.replace("xyz:", "")}</div>
                <div className="text-[10px] text-hl-text-tertiary">{r.krName}</div>
              </td>
              <td className="px-4 py-3 text-right font-mono text-hl-text-primary">${r.markPx.toFixed(2)}</td>
              <td className="px-4 py-3 text-right font-mono text-hl-text-primary text-sm">
                ₩{r.krCloseKrw.toLocaleString("ko-KR")}
              </td>
              <td className={`px-4 py-3 text-right font-mono ${pnlColor(r.premiumPct)}`}>
                {r.premiumPct >= 0 ? "+" : ""}{r.premiumPct.toFixed(2)}%
              </td>
              <td className={`px-4 py-3 text-right font-mono font-bold ${pnlColor(r.aprPct)}`}>
                {r.aprPct.toFixed(1)}%
              </td>
              <td className={`px-4 py-3 text-right font-mono ${pnlColor(r.fundingHourly)}`}>
                {(r.fundingHourly * 24 * 100).toFixed(3)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
