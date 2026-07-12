"use client";
import type { ArbPair } from "@/lib/arbStore";
import {
  calcPremiumPct,
  calcCapitalUsd,
  calcAprPct,
  calcDeltaMismatchPct,
  isDeltaNeutral,
} from "@/lib/arb";
import { formatUsd, pnlColor } from "@/lib/format";

interface Props {
  pair: ArbPair;
  hlSizeAbs: number;
  hlMarkUsd: number;
  fundingHourly: number;
  cumFundingUsd: number;
  krCloseKrw: number;
  usdKrwHana: number;
  usdtKrwUpbit: number;
  krName: string;
  krNxtPrice?: number | null;
  krNxtSession?: "PRE" | "AFTER_MARKET" | null;
  onEdit: () => void;
  onClose: () => void;
}

export default function LedgerCard({
  pair, hlSizeAbs, hlMarkUsd, fundingHourly, cumFundingUsd,
  krCloseKrw, usdKrwHana, usdtKrwUpbit, krName, krNxtPrice, krNxtSession, onEdit, onClose,
}: Props) {
  const premium = calcPremiumPct({ hlMarkUsd, usdtKrw: usdtKrwUpbit, krCloseKrw });
  const capital = calcCapitalUsd({
    hlSizeAbs, hlMarkUsd,
    krQuantity: pair.krLeg.quantity, krAvgPriceKrw: pair.krLeg.avgPriceKrw, usdKrwHana,
  });
  const apr = calcAprPct({
    hlNotionalUsd: hlSizeAbs * hlMarkUsd,
    fundingHourly,
    capitalUsd: capital,
  });
  const delta = calcDeltaMismatchPct({
    hlSizeAbs, hlMarkUsd,
    krQuantity: pair.krLeg.quantity, krCloseKrw, usdKrwHana,
  });
  const neutral = isDeltaNeutral(delta);

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-hl-bg-tertiary border-b border-hl-border">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-hl-text-primary">{krName}</span>
          <span className="text-xs text-hl-text-tertiary font-mono">
            {pair.hlSymbol} / {pair.krLeg.krCode}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              neutral
                ? "bg-hl-green/15 text-hl-green"
                : "bg-hl-yellow/15 text-hl-yellow"
            }`}
          >
            {neutral ? "DELTA NEUTRAL ✓" : `Δ ${delta.toFixed(1)}% ⚠`}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-hl-text-tertiary">APR</span>
          <span className={`font-mono font-bold ${pnlColor(apr)}`}>
            {apr.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-hl-border">
        <div className="p-4">
          <div className="text-[10px] text-hl-text-tertiary mb-1 uppercase tracking-wider">
            HL Short
          </div>
          <div className="font-mono text-hl-text-primary font-semibold">
            ${hlMarkUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-hl-text-tertiary mt-1">
            Size {hlSizeAbs.toFixed(4)}
          </div>
          <div className="text-[11px] text-hl-green mt-1">
            Funding {(fundingHourly * 100).toFixed(4)}%/h
          </div>
        </div>
        <div className="p-4">
          <div className="text-[10px] text-hl-text-tertiary mb-1 uppercase tracking-wider">
            KR Spot
          </div>
          <div className="font-mono text-hl-text-primary font-semibold">
            ₩{krCloseKrw.toLocaleString("ko-KR")}
          </div>
          <div className="text-[11px] text-hl-text-tertiary mt-1">
            Avg ₩{pair.krLeg.avgPriceKrw.toLocaleString("ko-KR")} · Qty {pair.krLeg.quantity}
          </div>
          {krNxtPrice != null && (
            <div className="text-[11px] text-hl-accent mt-1">
              NXT ₩{krNxtPrice.toLocaleString("ko-KR")}
              {krNxtSession && <span className="text-hl-text-tertiary ml-1">({krNxtSession})</span>}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-hl-bg-primary/40">
        <div className="flex gap-6 text-xs">
          <div>
            <div className="text-hl-text-tertiary text-[10px] uppercase">Premium</div>
            <div className={`font-mono font-bold ${pnlColor(premium)}`}>
              {premium >= 0 ? "+" : ""}{premium.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-hl-text-tertiary text-[10px] uppercase">Funding</div>
            <div className={`font-mono font-bold ${pnlColor(cumFundingUsd)}`}>
              {formatUsd(cumFundingUsd)}
            </div>
          </div>
          <div>
            <div className="text-hl-text-tertiary text-[10px] uppercase">Capital</div>
            <div className="font-mono font-bold text-hl-text-primary">
              {formatUsd(capital)}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-2 py-1 text-[11px] rounded border border-hl-border text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light"
          >
            Edit
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 text-[11px] rounded border border-hl-border text-hl-text-secondary hover:text-hl-red hover:border-hl-red/50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
