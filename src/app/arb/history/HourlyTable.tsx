"use client";
import { useState } from "react";
import type { LedgerEvent } from "@/lib/fundingLedger";
import { formatUsd, pnlColor } from "@/lib/format";

interface Props {
  events: LedgerEvent[]; // 시간 오름차순 입력 → 최신부터 렌더
  defaultVisible: number;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00`;
}

export default function HourlyTable({ events, defaultVisible }: Props) {
  const [visibleCount, setVisibleCount] = useState(defaultVisible);
  const desc = [...events].reverse();
  const visible = desc.slice(0, visibleCount);
  const hidden = desc.length - visible.length;

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">시간별 기록</h3>
        <span className="text-[11px] text-hl-text-tertiary font-mono">최근 {visible.length}건</span>
      </div>
      {desc.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-xs text-hl-text-tertiary">
          정산 기록 없음
        </div>
      ) : (
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-hl-text-tertiary">
              <th className="text-left px-4 py-2 font-medium">시각</th>
              <th className="text-left px-4 py-2 font-medium">코인</th>
              <th className="text-right px-4 py-2 font-medium">펀딩률</th>
              <th className="text-right px-4 py-2 font-medium">펀딩피</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
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
                <td className="px-4 py-1.5 text-hl-text-primary">{e.coin}</td>
                {/* 숏 입장에선 양(+)의 펀딩률이 수익 → 양수를 그대로 초록으로. */}
                <td className={`px-4 py-1.5 text-right ${pnlColor(e.rate)}`}>
                  {(e.rate * 100).toFixed(4)}%
                </td>
                <td className={`px-4 py-1.5 text-right ${pnlColor(e.usdc)}`}>{formatUsd(e.usdc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && (
        <button
          onClick={() => setVisibleCount((n) => n + 168)}
          className="w-full py-2 text-[11px] text-hl-text-secondary hover:text-hl-accent border-t border-hl-border transition-colors"
        >
          더보기 ({hidden}건 더)
        </button>
      )}
    </div>
  );
}
