"use client";
import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import type { LedgerStats } from "@/lib/fundingLedger";
import { calcRealizedAprPct, calcTotalReturnPct, calcKimchiPct, isAprReliable } from "@/lib/arb";
import { useAprBasis, APR_BASIS_LABEL } from "@/lib/aprBasis";
import { formatUsd, formatKrwCompact, pnlColor } from "@/lib/format";

interface Props {
  stats: LedgerStats;
  /** Σ(활성 페어 sizeAbs × markPx × fundingHourly) — 다음 정산 예상 수취액 */
  nextFundingUsd: number | null;
  spotPrincipalKrw: number;   // Σ quantity × avgPriceKrw (활성 페어)
  hlEquityUsd: number | null; // useHlEquity 합산
  otherAdjustUsd: number;     // capitalAdjustmentUsd
  capitalEventCount: number;
  usdKrwHana: number | null;
  /** USDT/KRW (업비트) — 예치금·투입자본의 원화 환산 표기용 */
  usdtKrw: number | null;
  loading: boolean;
}

function fmtStartDate(ts: number | null): string {
  if (ts == null) return "—";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} 시작`;
}

export default function StatGrid({
  stats,
  nextFundingUsd,
  spotPrincipalKrw,
  hlEquityUsd,
  otherAdjustUsd,
  capitalEventCount,
  usdKrwHana,
  usdtKrw,
  loading,
}: Props) {
  const { basis, setBasis } = useAprBasis();

  // 다음 정산(매시 정각)까지 카운트다운 — 1초마다 갱신
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const msToNextHour = 3600000 - (now % 3600000);
  const mm = Math.floor(msToNextHour / 60000);
  const ss = Math.floor((msToNextHour % 60000) / 1000);

  const spotPrincipalUsd =
    usdKrwHana != null && usdKrwHana > 0 ? spotPrincipalKrw / usdKrwHana : null;
  const fullCapital =
    hlEquityUsd != null && spotPrincipalUsd != null
      ? hlEquityUsd + spotPrincipalUsd + otherAdjustUsd
      : null;
  const capital = basis === "hl" ? hlEquityUsd : fullCapital;

  const elapsedHours = stats.elapsedDays * 24;
  const reliable = isAprReliable(elapsedHours, stats.settlementCount);
  const apr =
    capital != null && reliable
      ? calcRealizedAprPct({ totalFundingUsd: stats.totalUsdc, capitalUsd: capital, elapsedHours })
      : null;
  const totalReturn = capital != null ? calcTotalReturnPct(stats.totalUsdc, capital) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-hl-text-tertiary uppercase tracking-wider">APR 기준</span>
        <div className="flex rounded-lg overflow-hidden border border-hl-border">
          {(["full", "hl"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBasis(b)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                basis === b ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"
              }`}
            >
              {APR_BASIS_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="누적 펀딩 수익"
          value={formatUsd(stats.totalUsdc)}
          valueClass={pnlColor(stats.totalUsdc)}
          subtitle={`${fmtStartDate(stats.firstOpenedAt)} · ${Math.floor(stats.elapsedDays) + 1}일째 · 정산 ${stats.settlementCount.toLocaleString("en-US")}회`}
          loading={loading}
        />
        <StatCard
          title="자본 대비 연 APR"
          value={apr != null ? `${apr.toFixed(1)}%` : "—"}
          subtitle={
            capital == null
              ? "환율/예치금 조회 대기"
              : reliable
                ? `누적 수익률 ${totalReturn!.toFixed(2)}% · ${APR_BASIS_LABEL[basis]}`
                : "표본 부족 (24h·3회 미만)"
          }
          loading={loading}
        />
        <StatCard
          title="직전 펀비"
          value={stats.lastHourUsdc != null ? formatUsd(stats.lastHourUsdc) : "—"}
          valueClass={stats.lastHourUsdc != null ? pnlColor(stats.lastHourUsdc) : undefined}
          subtitle={
            stats.lastHourTime != null
              ? new Date(stats.lastHourTime).toLocaleString("ko-KR", {
                  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                })
              : "정산 기록 없음"
          }
          loading={loading}
        />
        <StatCard
          title="다음 펀비 예상"
          value={nextFundingUsd != null ? formatUsd(nextFundingUsd) : "—"}
          valueClass={nextFundingUsd != null ? pnlColor(nextFundingUsd) : undefined}
          subtitle={`정산까지 ${mm}:${String(ss).padStart(2, "0")}`}
          loading={loading}
        />
        <StatCard
          title="현재 투입 자본"
          value={fullCapital != null ? formatUsd(fullCapital) : "—"}
          subtitle={
            fullCapital != null && usdtKrw != null
              ? `≈ ${formatKrwCompact(fullCapital * usdtKrw)} · 입출금 ${capitalEventCount}건`
              : `입출금 ${capitalEventCount}건 기록`
          }
          loading={loading}
        />
        <StatCard
          title="현물 원금"
          value={formatKrwCompact(spotPrincipalKrw)}
          subtitle={
            spotPrincipalKrw === 0
              ? "장부 기록 없음 — 다른 기기에서 입력했다면 기기 동기화"
              : spotPrincipalUsd != null
                ? formatUsd(spotPrincipalUsd)
                : "환율 대기"
          }
          loading={loading}
        />
        <StatCard
          title="HL 예치금"
          value={hlEquityUsd != null ? formatUsd(hlEquityUsd) : "—"}
          subtitle={
            hlEquityUsd != null && usdtKrw != null
              ? `≈ ${formatKrwCompact(hlEquityUsd * usdtKrw)} (USDT ₩${usdtKrw.toLocaleString("ko-KR")})`
              : "실시간 조회 중"
          }
          loading={loading}
        />
        <StatCard
          title="적용 환율"
          value={usdKrwHana != null ? `₩${usdKrwHana.toLocaleString("ko-KR")}` : "—"}
          subtitle={
            usdKrwHana != null && usdtKrw != null
              ? `하나은행 · USDT ₩${usdtKrw.toLocaleString("ko-KR")} (김프 ${calcKimchiPct(usdtKrw, usdKrwHana) >= 0 ? "+" : ""}${calcKimchiPct(usdtKrw, usdKrwHana).toFixed(2)}%)`
              : "USD/KRW 하나은행"
          }
          loading={loading}
        />
      </div>
    </div>
  );
}
