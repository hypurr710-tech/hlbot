"use client";
import { useMemo, useState } from "react";
import type { LedgerEvent } from "@/lib/fundingLedger";
import { formatUsd, pnlColor } from "@/lib/format";
import FundingHistoryChart from "../FundingHistoryChart";

interface Props {
  events: LedgerEvent[]; // 시간 오름차순 입력 → 최신부터 렌더
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00`;
}

export default function HourlyTable({ events }: Props) {
  const [view, setView] = useState<"list" | "chart">("list");
  const desc = useMemo(() => [...events].reverse(), [events]);
  const chartEvents = useMemo(
    () => events.map((e) => ({ time: e.time, usdc: e.usdc })),
    [events]
  );

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">시간별 기록</h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-hl-text-tertiary font-mono">{desc.length}건</span>
          <div className="flex rounded overflow-hidden border border-hl-border text-[11px]">
            {(["list", "chart"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2 py-0.5 ${
                  view === v ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"
                }`}
              >
                {v === "list" ? "목록" : "차트"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {desc.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-xs text-hl-text-tertiary">
          정산 기록 없음
        </div>
      ) : view === "chart" ? (
        <div className="p-4">
          <FundingHistoryChart events={chartEvents} />
        </div>
      ) : (
        /* 10행 정도만 보이고 나머지는 내부 스크롤 */
        <div className="max-h-[340px] overflow-y-auto">
          <table className="w-full text-[13px] font-mono">
            <thead className="sticky top-0 bg-hl-bg-secondary">
              <tr className="text-[10px] uppercase tracking-wider text-hl-text-tertiary">
                <th className="text-left px-4 py-2 font-medium">시각</th>
                <th className="text-left px-4 py-2 font-medium">티커</th>
                <th className="text-right px-4 py-2 font-medium">펀딩률</th>
                <th className="text-right px-4 py-2 font-medium">펀딩피</th>
              </tr>
            </thead>
            <tbody>
              {desc.map((e) => (
                <tr
                  key={`${e.time}-${e.coin}-${e.pairId}`}
                  className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors"
                >
                  <td className="px-4 py-1.5 text-hl-text-secondary">
                    {timeLabel(e.time)}
                    {e.nSamples > 1 && (
                      <span className="ml-1.5 px-1 py-px rounded bg-hl-bg-tertiary text-[9px] text-hl-text-tertiary">
                        {e.nSamples}h 합산
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-1.5">
                    <span className="text-hl-text-tertiary">xyz:</span>
                    <span className="text-hl-text-primary">{e.coin}</span>
                  </td>
                  {/* 숏 입장에선 양(+)의 펀딩률이 수익 → 양수를 그대로 초록으로. */}
                  <td className={`px-4 py-1.5 text-right ${pnlColor(e.rate)}`}>
                    {(e.rate * 100).toFixed(4)}%
                  </td>
                  <td className={`px-4 py-1.5 text-right ${pnlColor(e.usdc)}`}>{formatUsd(e.usdc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
