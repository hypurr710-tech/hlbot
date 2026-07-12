"use client";
import { useState } from "react";
import type { ArbPair } from "@/lib/arbStore";
import {
  calcPremiumPct,
  calcCapitalUsd,
  calcAprPct,
  calcDeltaMismatchPct,
  isDeltaNeutral,
  calcRealizedAprPct,
  calcTotalReturnPct,
} from "@/lib/arb";
import { formatUsd, pnlColor } from "@/lib/format";
import FundingHistoryChart from "./FundingHistoryChart";

interface Props {
  pair: ArbPair;
  hlSizeAbs: number;
  hlMarkUsd: number;
  fundingHourly: number;                                        // current 1h rate (for projected APR)
  cumFundingUsd: number;                                         // from HL cumFunding.sinceOpen
  krLivePriceKrw: number;
  krPriceSource: "regular" | "nxt";
  usdKrwHana: number;
  usdtKrwUpbit: number;
  krName: string;
  krNxtSession?: "PRE" | "AFTER_MARKET" | null;
  realizedFundingEvents: Array<{ time: number; usdc: number }>; // filtered to this pair's symbol
  onEdit: () => void;
  onClose: () => void;
}

export default function LedgerCard({
  pair, hlSizeAbs, hlMarkUsd, fundingHourly, cumFundingUsd,
  krLivePriceKrw, krPriceSource, usdKrwHana, usdtKrwUpbit, krName, krNxtSession,
  realizedFundingEvents,
  onEdit, onClose,
}: Props) {
  const premium = calcPremiumPct({ hlMarkUsd, usdtKrw: usdtKrwUpbit, krCloseKrw: krLivePriceKrw });
  const capital = calcCapitalUsd({
    hlSizeAbs, hlMarkUsd,
    krQuantity: pair.krLeg.quantity, krAvgPriceKrw: pair.krLeg.avgPriceKrw, usdKrwHana,
  });
  const projectedApr = calcAprPct({
    hlNotionalUsd: hlSizeAbs * hlMarkUsd,
    fundingHourly,
    capitalUsd: capital,
  });
  const delta = calcDeltaMismatchPct({
    hlSizeAbs, hlMarkUsd,
    krQuantity: pair.krLeg.quantity, krCloseKrw: krLivePriceKrw, usdKrwHana,
  });
  const neutral = isDeltaNeutral(delta);
  const isNxt = krPriceSource === "nxt";

  // Realized metrics — filter events to since-open and derive stats
  const now = Date.now();
  const elapsedMs = Math.max(0, now - pair.createdAt);
  const elapsedHours = elapsedMs / 3600000;
  const elapsedDays = elapsedMs / 86400000;

  const eventsSinceOpen = realizedFundingEvents.filter((e) => e.time >= pair.createdAt);
  const totalRealizedFunding = eventsSinceOpen.reduce((s, e) => s + e.usdc, 0);
  const settlementCount = eventsSinceOpen.length;

  const realizedApr = calcRealizedAprPct({
    totalFundingUsd: totalRealizedFunding,
    capitalUsd: capital,
    elapsedHours,
  });
  const totalReturnPct = calcTotalReturnPct(totalRealizedFunding, capital);

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
          <span
            className="text-hl-text-tertiary cursor-help"
            title="실현 펀딩을 경과 시간으로 연환산한 실효 APR · 분모 = HL 노셔널 + KR 현물 원화의 USD 환산"
          >
            실효 APR<span className="text-hl-text-tertiary ml-0.5 text-[9px]">?</span>
          </span>
          <span className={`font-mono font-bold ${pnlColor(realizedApr)}`}>
            {realizedApr.toFixed(1)}%
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
          <div className="font-mono text-hl-text-primary font-semibold flex items-center gap-1.5">
            <span>₩{krLivePriceKrw.toLocaleString("ko-KR")}</span>
            {isNxt && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-hl-accent/15 text-hl-accent">
                NXT{krNxtSession ? `·${krNxtSession}` : ""}
              </span>
            )}
          </div>
          <div className="text-[11px] text-hl-text-tertiary mt-1">
            Avg ₩{pair.krLeg.avgPriceKrw.toLocaleString("ko-KR")} · Qty {pair.krLeg.quantity}
          </div>
        </div>
      </div>

      {/* Realized stats row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 px-4 py-3 bg-hl-bg-primary/40 border-t border-hl-border text-xs">
        <div>
          <div className="text-[10px] text-hl-text-tertiary uppercase">경과</div>
          <div className="font-mono text-hl-text-primary">
            {Math.floor(elapsedDays)}일 {Math.floor(elapsedHours % 24)}시간
          </div>
        </div>
        <div>
          <div className="text-[10px] text-hl-text-tertiary uppercase">정산</div>
          <div className="font-mono text-hl-text-primary">{settlementCount}회</div>
        </div>
        <div>
          <div className="text-[10px] text-hl-text-tertiary uppercase">누적 펀딩</div>
          <div className={`font-mono font-bold ${pnlColor(totalRealizedFunding)}`}>
            {formatUsd(totalRealizedFunding)}
          </div>
        </div>
        <div>
          <div className="text-[10px] text-hl-text-tertiary uppercase">누적 수익률</div>
          <div className={`font-mono font-bold ${pnlColor(totalReturnPct)}`}>
            {totalReturnPct >= 0 ? "+" : ""}{totalReturnPct.toFixed(2)}%
          </div>
        </div>
        <div>
          <div
            className="text-[10px] text-hl-text-tertiary uppercase cursor-help"
            title="현재 펀딩률이 유지된다고 가정한 예상 APR"
          >
            예상 APR<span className="text-hl-text-tertiary/60 ml-0.5">?</span>
          </div>
          <div className={`font-mono ${pnlColor(projectedApr)}`}>
            {projectedApr.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Secondary metrics row — premium / cumFundingUsd (HL native) / capital + actions */}
      <div className="flex items-center justify-between px-4 py-3 bg-hl-bg-primary/40 border-t border-hl-border">
        <div className="flex gap-6 text-xs">
          <div>
            <div className="text-hl-text-tertiary text-[10px] uppercase">Premium</div>
            <div className={`font-mono font-bold ${pnlColor(premium)}`}>
              {premium >= 0 ? "+" : ""}{premium.toFixed(2)}%
            </div>
          </div>
          <div>
            <div
              className="text-hl-text-tertiary text-[10px] uppercase cursor-help"
              title="HL cumFunding.sinceOpen (포지션 오픈 이후 HL 자체 집계)"
            >
              HL Funding
            </div>
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

      <HistoryToggle events={eventsSinceOpen} />
    </div>
  );
}

function HistoryToggle({ events }: { events: Array<{ time: number; usdc: number }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-hl-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-2 text-xs text-hl-text-tertiary hover:text-hl-text-primary transition-colors flex items-center justify-between"
      >
        <span>펀딩 히스토리 {open ? "▲" : "▼"}</span>
        <span className="font-mono">{events.length}건</span>
      </button>
      {open && (
        <div className="px-4 pb-4">
          <FundingHistoryChart events={events} />
        </div>
      )}
    </div>
  );
}
