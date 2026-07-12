"use client";
import { getTickerByHl } from "@/lib/tickerMap";

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

export default function UnhedgedList({ shorts, onPairUp }: Props) {
  if (shorts.length === 0) return null;
  return (
    <div className="bg-hl-yellow/5 border border-hl-yellow/30 rounded-xl p-4 mb-4">
      <div className="text-xs font-semibold text-hl-yellow mb-2 uppercase tracking-wider">
        Unhedged HL shorts ({shorts.length})
      </div>
      <div className="space-y-2">
        {shorts.map((s) => {
          const mapped = getTickerByHl(s.hlSymbol);
          return (
            <div key={`${s.hlAddress}-${s.hlSymbol}`}
              className="flex items-center justify-between text-sm">
              <div>
                <span className="font-mono text-hl-text-primary">{s.hlSymbol}</span>
                <span className="text-xs text-hl-text-tertiary ml-2">
                  {s.sizeAbs.toFixed(4)} @ ${s.markPx.toFixed(2)}
                </span>
                {!mapped && (
                  <span className="ml-2 text-[10px] text-hl-red">
                    (no KR mapping — will need manual entry)
                  </span>
                )}
              </div>
              <button
                onClick={() => onPairUp(s)}
                className="px-2 py-1 text-[11px] rounded border border-hl-yellow/40 text-hl-yellow hover:bg-hl-yellow/10"
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
