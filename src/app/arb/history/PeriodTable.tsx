"use client";
import { useState } from "react";
import type { PeriodRow, FundingPeriod } from "@/lib/arb";
import { formatUsd, pnlColor } from "@/lib/format";

interface Props {
  title: string;
  rows: PeriodRow[];       // 시간 오름차순 입력 → 최신부터 렌더
  period: FundingPeriod;   // "day" | "month" (라벨 포맷용)
  defaultVisible: number;
  /** 표본이 부족하면 APR 컬럼을 — 처리 (isAprReliable 판정 결과) */
  aprReliable: boolean;
}

function rowLabel(key: string, period: FundingPeriod): string {
  if (period === "month") {
    const [y, m] = key.split("-");
    return `${y}년 ${Number(m)}월`;
  }
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default function PeriodTable({ title, rows, period, defaultVisible, aprReliable }: Props) {
  const [expanded, setExpanded] = useState(false);
  const desc = [...rows].reverse();
  const visible = expanded ? desc : desc.slice(0, defaultVisible);
  const hidden = desc.length - visible.length;

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">{title}</h3>
        <span className="text-[11px] text-hl-text-tertiary font-mono">
          {rows.length}
          {period === "month" ? "개월" : "일"}
        </span>
      </div>
      {desc.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-xs text-hl-text-tertiary">
          정산 기록 없음
        </div>
      ) : (
        <table className="w-full text-[13px] font-mono">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-hl-text-tertiary">
              <th className="text-left px-4 py-2 font-medium">{period === "month" ? "월" : "날짜"}</th>
              <th className="text-right px-4 py-2 font-medium">펀딩피</th>
              <th className="text-right px-4 py-2 font-medium">수익률</th>
              <th className="text-right px-4 py-2 font-medium">연 APR</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors">
                <td className="px-4 py-2 text-hl-text-secondary">{rowLabel(r.key, period)}</td>
                <td className={`px-4 py-2 text-right ${pnlColor(r.usdc)}`}>{formatUsd(r.usdc)}</td>
                <td className={`px-4 py-2 text-right ${pnlColor(r.returnPct)}`}>
                  {r.returnPct >= 0 ? "+" : ""}
                  {r.returnPct.toFixed(3)}%
                </td>
                <td className={`px-4 py-2 text-right ${aprReliable ? pnlColor(r.aprPct) : "text-hl-text-tertiary"}`}>
                  {aprReliable ? `${r.aprPct.toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-[11px] text-hl-text-secondary hover:text-hl-accent border-t border-hl-border transition-colors"
        >
          더보기 ({hidden}
          {period === "month" ? "개월" : "일"} 더)
        </button>
      )}
      {expanded && desc.length > defaultVisible && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full py-2 text-[11px] text-hl-text-secondary hover:text-hl-accent border-t border-hl-border transition-colors"
        >
          접기
        </button>
      )}
    </div>
  );
}
