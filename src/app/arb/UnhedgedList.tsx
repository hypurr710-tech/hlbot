"use client";
import Link from "next/link";
import { getTickerByHl } from "@/lib/tickerMap";
import { formatAddress } from "@/lib/format";

export interface UnhedgedShort {
  hlAddress: string;
  hlSymbol: string;
  sizeAbs: number;
  markPx: number;
}

interface Props {
  shorts: UnhedgedShort[];
  onPairUp: (short: UnhedgedShort) => void;
}

/** 원장(페어)에 아직 등록 안 된 HL 숏 목록.
 *  실제로는 국내 현물로 헷지 중일 수 있으므로 "unhedged"라 단정하지 않는다.
 *  행을 클릭하면 펀딩 수익 기록 페이지로 이동. */
export default function UnhedgedList({ shorts, onPairUp }: Props) {
  if (shorts.length === 0) return null;
  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 mb-4">
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-xs font-semibold text-hl-text-secondary uppercase tracking-wider">
          HL 숏 포지션 — 원장 미등록 ({shorts.length})
        </div>
        <span className="text-[10px] text-hl-text-tertiary">클릭하면 펀딩 수익 기록으로</span>
      </div>
      <div className="space-y-1">
        {shorts.map((s) => {
          const mapped = getTickerByHl(s.hlSymbol);
          return (
            <div
              key={`${s.hlAddress}-${s.hlSymbol}`}
              className="flex items-center justify-between text-sm rounded-lg -mx-2 px-2 py-1.5 hover:bg-hl-bg-hover transition-colors"
            >
              <Link href="/arb/history" className="flex-1 min-w-0">
                <span className="font-mono text-hl-text-primary">{s.hlSymbol}</span>
                <span className="text-xs text-hl-text-tertiary ml-2 font-mono">
                  {s.sizeAbs.toFixed(4)} @ ${s.markPx.toFixed(2)} · {formatAddress(s.hlAddress)}
                </span>
                {!mapped && (
                  <span className="ml-2 text-[10px] text-hl-red">(KR 매핑 없음 — 수동 입력 필요)</span>
                )}
              </Link>
              <button
                onClick={() => onPairUp(s)}
                className="ml-3 px-2 py-1 text-[11px] rounded border border-hl-border text-hl-text-secondary hover:text-hl-accent hover:border-hl-accent/50 transition-colors"
                title="국내 현물 다리를 등록해 원장 페어로 만들기"
              >
                Pair up
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
