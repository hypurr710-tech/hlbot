"use client";
import { useMemo, useState } from "react";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { loadTickerMap } from "@/lib/tickerMap";
import {
  calcPremiumPct,
  calcAprPct,
  calcCapitalUsd,
  hlPriceKrw,
  selectLiveKrPrice,
  isLiveKrFromNxt,
} from "@/lib/arb";
import { pnlColor } from "@/lib/format";

type SortKey = "apr" | "premium" | "funding" | "volume";

interface Row {
  hlSymbol: string;
  krName: string;
  krCode: string;
  hlMarkUsd: number;
  hlMidUsd: number;
  fundingHourly: number;
  openInterest: number;
  dayNtlVlm: number;
  krClose: number;
  krPrevClose: number;
  krNxtPrice: number | null;
  krNxtSession: "PRE" | "AFTER_MARKET" | null;
  krMarketOpen: boolean;
  krPriceSource: "regular" | "nxt";
  hlPriceInKrw: number;
  premiumPct: number;
  aprPct: number;
  projected24hFundingUsd: number;
}

interface Props { snapshot: LiveSnapshot }

const HIDE_BELOW_ABS_PREMIUM_PCT = 0.05;

function formatKrw(n: number): string {
  return `₩${n.toLocaleString("ko-KR")}`;
}
function formatUsdShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(2)}`;
}

export default function ScannerTable({ snapshot }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("apr");

  const rows = useMemo<Row[]>(() => {
    if (snapshot.fx.usdKrwHana == null || snapshot.fx.usdtKrwUpbit == null) return [];
    const map = loadTickerMap();
    const out: Row[] = [];
    for (const t of map) {
      const hl = snapshot.hl[t.hlSymbol];
      const kr = snapshot.kr[t.hlSymbol];
      if (!hl || !kr) continue;
      const krLive = selectLiveKrPrice(kr);
      const premium = calcPremiumPct({
        hlMarkUsd: hl.markPx,
        usdtKrw: snapshot.fx.usdtKrwUpbit,
        krCloseKrw: krLive,
      });
      if (Math.abs(premium) < HIDE_BELOW_ABS_PREMIUM_PCT) continue;
      const hlSizeAbs = 1;
      const krQuantity = krLive > 0 ? (hl.markPx * snapshot.fx.usdKrwHana) / krLive : 0;
      const capital = calcCapitalUsd({
        hlSizeAbs,
        hlMarkUsd: hl.markPx,
        krQuantity,
        krAvgPriceKrw: krLive,
        usdKrwHana: snapshot.fx.usdKrwHana,
      });
      const apr = calcAprPct({
        hlNotionalUsd: hl.markPx,
        fundingHourly: hl.fundingHourly,
        capitalUsd: capital,
      });
      const projected24h = hl.markPx * hl.fundingHourly * 24;
      out.push({
        hlSymbol: t.hlSymbol,
        krName: t.krName,
        krCode: t.krCode,
        hlMarkUsd: hl.markPx,
        hlMidUsd: hl.midPx,
        fundingHourly: hl.fundingHourly,
        openInterest: hl.openInterest,
        dayNtlVlm: hl.dayNtlVlm,
        krClose: krLive,
        krPrevClose: kr.prevClose,
        krNxtPrice: kr.nxtPrice,
        krNxtSession: kr.nxtSession,
        krMarketOpen: kr.marketOpen,
        krPriceSource: isLiveKrFromNxt(kr) ? "nxt" : "regular",
        hlPriceInKrw: hlPriceKrw(hl.markPx, snapshot.fx.usdtKrwUpbit),
        premiumPct: premium,
        aprPct: apr,
        projected24hFundingUsd: projected24h,
      });
    }
    return out.sort((a, b) => {
      if (sortKey === "apr") return b.aprPct - a.aprPct;
      if (sortKey === "premium") return b.premiumPct - a.premiumPct;
      if (sortKey === "funding") return b.fundingHourly - a.fundingHourly;
      return b.dayNtlVlm - a.dayNtlVlm;
    });
  }, [snapshot, sortKey]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-hl-text-tertiary leading-relaxed">
        매핑 종목 · 프리미엄 |≥ 0.05%| · APR은 현재 펀딩률 유지 가정 예상치
      </p>

      <div className="flex items-center flex-wrap gap-2 text-xs bg-hl-bg-secondary border border-hl-border rounded-lg px-3 py-2">
        <span className="text-hl-text-tertiary">Sort by</span>
        {(["apr", "premium", "funding", "volume"] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`px-2.5 py-1 rounded font-mono uppercase transition-colors ${
              sortKey === k
                ? "bg-hl-accent/20 text-hl-accent"
                : "text-hl-text-secondary hover:text-hl-text-primary hover:bg-hl-bg-hover"
            }`}
          >
            {k}
          </button>
        ))}
        <span className="ml-auto text-hl-text-tertiary text-[11px]">
          {rows.length}개
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-8 text-center text-sm text-hl-text-tertiary">
          현재 프리미엄이 0.05% 이상인 매핑 종목이 없어요.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {rows.map((r) => (
            <OpportunityCard key={r.hlSymbol} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ row: r }: { row: Row }) {
  const dayChangePct = r.krPrevClose > 0 ? ((r.krClose - r.krPrevClose) / r.krPrevClose) * 100 : 0;
  const premiumBg = r.premiumPct >= 0 ? "bg-hl-green/10 border-hl-green/30 text-hl-green" : "bg-hl-red/10 border-hl-red/30 text-hl-red";

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-hl-bg-tertiary border-b border-hl-border">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-hl-text-primary">{r.krName}</span>
          <span className="text-xs font-mono text-hl-text-tertiary">
            {r.hlSymbol} · {r.krCode}
          </span>
        </div>
        <a
          href={`https://app.hyperliquid.xyz/trade/${r.hlSymbol}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-hl-accent hover:text-hl-accent/80 font-medium"
        >
          차트 ↗
        </a>
      </div>

      {/* Big price row */}
      <div className="px-5 py-4 flex items-end justify-between border-b border-hl-border">
        <div>
          <div className="text-[10px] text-hl-text-tertiary uppercase tracking-wider mb-1">
            HL Perp (김프 ON, USDT/KRW 환산)
          </div>
          <div className="text-2xl font-bold font-mono text-hl-text-primary tabular-nums">
            {formatKrw(Math.round(r.hlPriceInKrw))}
          </div>
          <div className="text-xs text-hl-text-tertiary font-mono mt-0.5">
            ≈ ${r.hlMarkUsd.toFixed(2)} USD
          </div>
        </div>
        <div className={`px-3 py-2 rounded-lg border ${premiumBg} text-right`}>
          <div className="text-[10px] uppercase tracking-wider opacity-80">Premium</div>
          <div className="text-xl font-bold font-mono tabular-nums">
            {r.premiumPct >= 0 ? "+" : ""}
            {r.premiumPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div className="grid grid-cols-2 divide-x divide-hl-border border-b border-hl-border">
        <div className="px-5 py-3">
          <div className="text-[10px] text-hl-text-tertiary uppercase tracking-wider mb-1">
            {r.krPriceSource === "nxt" ? (
              <>NXT 현재가 <span className="text-hl-text-tertiary/60">(NAVER)</span></>
            ) : (
              <>한국장 종가 <span className="text-hl-text-tertiary/60">(NAVER)</span></>
            )}
          </div>
          <div className={`text-base font-semibold font-mono tabular-nums ${r.krPriceSource === "nxt" ? "text-hl-accent" : "text-hl-text-primary"}`}>
            {formatKrw(r.krClose)}
          </div>
          <div className={`text-[11px] font-mono ${pnlColor(dayChangePct)}`}>
            {dayChangePct >= 0 ? "+" : ""}
            {dayChangePct.toFixed(2)}% 전일比
          </div>
        </div>
        <div className="px-5 py-3">
          <div className="text-[10px] text-hl-text-tertiary uppercase tracking-wider mb-1">
            24h 거래대금 <span className="text-hl-text-tertiary/60">(HL)</span>
          </div>
          <div className="text-base font-semibold font-mono text-hl-text-primary tabular-nums">
            {formatUsdShort(r.dayNtlVlm)}
          </div>
          <div className="text-[11px] font-mono text-hl-text-tertiary">
            OI {r.openInterest.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-hl-border border-b border-hl-border">
        <div className="px-5 py-3">
          {r.krPriceSource === "nxt" ? (
            <>
              <div className="text-[10px] text-hl-text-tertiary uppercase tracking-wider mb-1">
                정규장 종가 <span className="text-hl-text-tertiary/60">(기준일)</span>
              </div>
              <div className="text-base font-semibold font-mono text-hl-text-primary tabular-nums">
                {formatKrw(r.krPrevClose > 0 ? r.krPrevClose : r.krClose)}
              </div>
              <div className="text-[11px] font-mono text-hl-text-tertiary">
                stale
              </div>
            </>
          ) : (
            <>
              <div className="text-[10px] text-hl-text-tertiary uppercase tracking-wider mb-1">
                시간외 (NXT)
              </div>
              {r.krNxtPrice != null ? (
                <>
                  <div className="text-base font-semibold font-mono text-hl-accent tabular-nums">
                    {formatKrw(r.krNxtPrice)}
                  </div>
                  <div className="text-[11px] font-mono text-hl-text-tertiary">
                    {r.krNxtSession ?? "—"}
                  </div>
                </>
              ) : (
                <div className="text-sm text-hl-text-tertiary font-mono">—</div>
              )}
            </>
          )}
        </div>
        <div className="px-5 py-3">
          <div className="text-[10px] text-hl-text-tertiary uppercase tracking-wider mb-1">
            펀딩비 (1h)
          </div>
          <div className={`text-base font-semibold font-mono tabular-nums ${pnlColor(r.fundingHourly)}`}>
            {(r.fundingHourly * 100).toFixed(4)}%
          </div>
          <div className="text-[11px] font-mono text-hl-text-tertiary">
            24h {(r.fundingHourly * 24 * 100).toFixed(3)}%
          </div>
        </div>
      </div>

      {/* Bottom highlight bar */}
      <div className="px-5 py-3 bg-hl-bg-primary/60 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <div
              className="text-[10px] text-hl-text-tertiary uppercase tracking-wider cursor-help"
              title="현재 펀딩률이 유지된다고 가정한 연 수익률 · 분모 = HL 노셔널 + KR 현물 원화의 USD 환산"
            >
              APR <span className="text-hl-text-tertiary/60">?</span>
            </div>
            <div className={`text-lg font-bold font-mono tabular-nums ${pnlColor(r.aprPct)}`}>
              {r.aprPct.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] text-hl-text-tertiary uppercase tracking-wider">
              24h 예상 펀딩
            </div>
            <div className={`text-sm font-mono tabular-nums ${pnlColor(r.projected24hFundingUsd)}`}>
              {r.projected24hFundingUsd >= 0 ? "+" : ""}${r.projected24hFundingUsd.toFixed(2)}
              <span className="text-hl-text-tertiary ml-1 text-[10px]">/HL unit</span>
            </div>
          </div>
        </div>
        <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${r.krMarketOpen ? "bg-hl-green/15 text-hl-green" : "bg-hl-yellow/15 text-hl-yellow"}`}>
          {r.krMarketOpen ? "KR OPEN" : "KR CLOSED"}
        </div>
      </div>
    </div>
  );
}
