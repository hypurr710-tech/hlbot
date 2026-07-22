"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveSnapshot } from "../useLiveSnapshot";
import { useHlXyzShorts } from "../useHlXyzShorts";
import { useArbPairs } from "@/hooks/useArbPairs";
import { fetchFundingWithCache } from "../useFundingHistory";
import { useHlEquity } from "./useHlEquity";
import type { FundingEvent } from "@/lib/hyperliquid";
import { collectPairEvents, calcLedgerStats } from "@/lib/fundingLedger";
import { aggregateFundingByPeriod, buildPeriodRows, isAprReliable } from "@/lib/arb";
import { loadCapitalEvents, capitalAdjustmentUsd } from "@/lib/capitalStore";
import { useAprBasis } from "@/lib/aprBasis";
import StatGrid from "./StatGrid";
import PeriodTable from "./PeriodTable";
import HourlyTable from "./HourlyTable";
import CapitalLedger from "./CapitalLedger";

export default function ArbHistoryPage() {
  const { snapshot } = useLiveSnapshot();
  const shorts = useHlXyzShorts();
  const { pairs } = useArbPairs(); // 청산 포함 전체 — 기록 페이지
  const { basis } = useAprBasis();

  // 청산 페어 포함 모든 지갑의 펀딩 이력
  const addresses = useMemo(
    () => Array.from(new Set(pairs.map((p) => p.hlAddress.toLowerCase()))).sort(),
    [pairs]
  );
  const addressesKey = addresses.join(",");
  const [fundingByAddress, setFundingByAddress] = useState<Record<string, FundingEvent[]>>({});
  const [fundingError, setFundingError] = useState(false);

  useEffect(() => {
    if (addresses.length === 0) { setFundingByAddress({}); return; }
    let cancelled = false;
    const load = async () => {
      let anyFailed = false;
      const results = await Promise.all(
        addresses.map(async (addr) => {
          try {
            return [addr, await fetchFundingWithCache(addr)] as const;
          } catch {
            anyFailed = true;
            return [addr, [] as FundingEvent[]] as const;
          }
        })
      );
      if (cancelled) return;
      const m: Record<string, FundingEvent[]> = {};
      for (const [addr, events] of results) m[addr] = events;
      setFundingByAddress(m);
      setFundingError(anyFailed);
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesKey]);

  // 활성 페어 지갑만 예치금 폴링 (청산 지갑은 자본에서 제외)
  const activePairs = useMemo(() => pairs.filter((p) => !p.closedAt), [pairs]);
  const activeAddresses = useMemo(
    () => Array.from(new Set(activePairs.map((p) => p.hlAddress.toLowerCase()))).sort(),
    [activePairs]
  );
  const { totalEquityUsd, loading: equityLoading } = useHlEquity(activeAddresses);

  const now = Date.now();
  const events = useMemo(
    () => collectPairEvents(pairs, fundingByAddress, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pairs, fundingByAddress]
  );
  const stats = useMemo(
    () => calcLedgerStats(events, pairs, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, pairs]
  );

  // 다음 펀비 예상 = Σ(활성 숏 노셔널 × 현재 시간당 펀딩률)
  const nextFundingUsd = useMemo(() => {
    if (!snapshot) return null;
    let sum = 0;
    let any = false;
    for (const p of activePairs) {
      const s = shorts.find(
        (x) => x.hlAddress.toLowerCase() === p.hlAddress.toLowerCase() && x.hlSymbol === p.hlSymbol
      );
      const hl = snapshot.hl[p.hlSymbol];
      if (!s || !hl) continue;
      any = true;
      sum += s.sizeAbs * hl.markPx * hl.fundingHourly;
    }
    return any ? sum : null;
  }, [snapshot, shorts, activePairs]);

  // 자본 (기준 토글 반영) — 테이블 수익률 분모
  const [capitalVersion, setCapitalVersion] = useState(0);
  const capitalEvents = useMemo(() => loadCapitalEvents(), [capitalVersion]);
  const otherAdjustUsd = capitalAdjustmentUsd(capitalEvents);
  const spotPrincipalKrw = activePairs.reduce(
    (s, p) => s + p.krLeg.quantity * p.krLeg.avgPriceKrw,
    0
  );
  const usdKrwHana = snapshot?.fx.usdKrwHana ?? null;
  const spotPrincipalUsd = usdKrwHana != null && usdKrwHana > 0 ? spotPrincipalKrw / usdKrwHana : null;
  const fullCapital =
    totalEquityUsd != null && spotPrincipalUsd != null
      ? totalEquityUsd + spotPrincipalUsd + otherAdjustUsd
      : null;
  const capitalForRows = basis === "hl" ? (totalEquityUsd ?? 0) : (fullCapital ?? 0);

  const dailyRows = useMemo(
    () => buildPeriodRows(aggregateFundingByPeriod(events, "day"), "day", capitalForRows, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, capitalForRows]
  );
  const monthlyRows = useMemo(
    () => buildPeriodRows(aggregateFundingByPeriod(events, "month"), "month", capitalForRows, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, capitalForRows]
  );
  const reliable = isAprReliable(stats.elapsedDays * 24, stats.settlementCount);

  const onCapitalChange = useCallback(() => setCapitalVersion((v) => v + 1), []);
  const loading = !snapshot && events.length === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">Funding 수익 기록</h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            펀딩비 정산 이력 · 자본 대비 수익률
          </p>
        </div>
        <Link
          href="/arb"
          className="text-xs text-hl-text-secondary hover:text-hl-accent border border-hl-border rounded-lg px-3 py-1.5 transition-colors"
        >
          ← Arb 스캐너
        </Link>
      </div>

      {fundingError && (
        <div className="bg-hl-yellow/10 border border-hl-yellow/30 text-hl-yellow text-xs p-2 rounded-lg font-mono">
          일부 지갑의 펀딩 이력을 불러오지 못했어 — 합계가 실제보다 작을 수 있음
        </div>
      )}

      <StatGrid
        stats={stats}
        nextFundingUsd={nextFundingUsd}
        spotPrincipalKrw={spotPrincipalKrw}
        hlEquityUsd={totalEquityUsd}
        otherAdjustUsd={otherAdjustUsd}
        capitalEventCount={capitalEvents.length}
        usdKrwHana={usdKrwHana}
        loading={loading && equityLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <PeriodTable title="월별 기록" rows={monthlyRows} period="month" defaultVisible={12} aprReliable={reliable} />
        <PeriodTable title="일별 기록" rows={dailyRows} period="day" defaultVisible={14} aprReliable={reliable} />
      </div>

      <HourlyTable events={events} defaultVisible={48} />

      <CapitalLedger onChange={onCapitalChange} />

      <footer className="pt-8 mt-8 border-t border-hl-border text-[11px] text-hl-text-tertiary font-mono leading-relaxed">
        <ul className="space-y-0.5">
          <li>· 데이터: api.hyperliquid.xyz userFunding(정산 이력) · clearinghouseState(예치금) · 하나은행 환율</li>
          <li>· 수익률 분모는 현재 자본 기준 — 과거 시점 자본 재구성 없음. 기타(대기자금) 입출금만 자본에 가산</li>
          <li className="text-hl-yellow/70">· 모든 수익률은 <span className="font-semibold">gross</span> — HL 수수료·국내 거래세·환전 스프레드 미반영</li>
        </ul>
      </footer>
    </div>
  );
}
