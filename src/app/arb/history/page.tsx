"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveSnapshot } from "../useLiveSnapshot";
import { useHlXyzShorts } from "../useHlXyzShorts";
import { useArbPairs } from "@/hooks/useArbPairs";
import { useAddresses } from "@/lib/store";
import { fetchFundingWithCache } from "../useFundingHistory";
import { useHlEquity } from "./useHlEquity";
import type { FundingEvent } from "@/lib/hyperliquid";
import { collectWalletEvents, calcLedgerStats } from "@/lib/fundingLedger";
import { aggregateFundingByPeriod, buildPeriodRows, isAprReliable } from "@/lib/arb";
import { loadCapitalEvents, capitalAdjustmentUsd } from "@/lib/capitalStore";
import { loadSpotTrades, computeSpotPositions } from "@/lib/spotLedger";
import { useAprBasis } from "@/lib/aprBasis";
import StatGrid from "./StatGrid";
import PeriodTable from "./PeriodTable";
import HourlyTable from "./HourlyTable";
import CapitalLedger from "./CapitalLedger";
import SpotTradeLedger from "./SpotTradeLedger";

export default function ArbHistoryPage() {
  const { snapshot } = useLiveSnapshot();
  const shorts = useHlXyzShorts();
  const { pairs } = useArbPairs(); // 청산 포함 전체 — 기록 페이지
  const { addresses: trackedAddresses } = useAddresses();
  const { basis } = useAprBasis();

  // Addresses 탭 지갑 ∪ 페어 지갑 — 페어 등록 없이도 지갑 펀딩 이력을 집계
  const addresses = useMemo(
    () =>
      Array.from(
        new Set([
          ...trackedAddresses.map((a) => a.address.toLowerCase()),
          ...pairs.map((p) => p.hlAddress.toLowerCase()),
        ])
      ).sort(),
    [trackedAddresses, pairs]
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

  // 전체 지갑 예치금 폴링 (Addresses ∪ 페어 지갑)
  const activePairs = useMemo(() => pairs.filter((p) => !p.closedAt), [pairs]);
  const { totalEquityUsd, loading: equityLoading } = useHlEquity(addresses);

  const now = Date.now();
  // 지갑 기준 수집 — 페어 등록 없이도 xyz 펀딩 이벤트 전부 포함
  const events = useMemo(
    () => collectWalletEvents(fundingByAddress),
    [fundingByAddress]
  );
  const stats = useMemo(
    () => calcLedgerStats(events, pairs, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, pairs]
  );

  // 다음 펀비 예상 = Σ(전체 지갑 숏 노셔널 × 현재 시간당 펀딩률) — 페어 등록 불필요
  const nextFundingUsd = useMemo(() => {
    if (!snapshot) return null;
    let sum = 0;
    let any = false;
    for (const s of shorts) {
      const hl = snapshot.hl[s.hlSymbol];
      if (!hl) continue;
      any = true;
      sum += s.sizeAbs * hl.markPx * hl.fundingHourly;
    }
    return any ? sum : null;
  }, [snapshot, shorts]);

  // 자본 (기준 토글 반영) — 테이블 수익률 분모
  const [capitalVersion, setCapitalVersion] = useState(0);
  const capitalEvents = useMemo(() => loadCapitalEvents(), [capitalVersion]);
  const otherAdjustUsd = capitalAdjustmentUsd(capitalEvents);

  // 현물 원금: 매매장부에 기록이 있는 종목은 장부가 정답(보유수량×이동평균 평단),
  // 기록이 없는 종목만 페어에 수동 입력한 수량×평단으로 보충.
  const [spotVersion, setSpotVersion] = useState(0);
  const spotTrades = useMemo(() => loadSpotTrades(), [spotVersion]);
  const spotPositions = useMemo(() => computeSpotPositions(spotTrades), [spotTrades]);
  const spotPrincipalKrw = useMemo(() => {
    const recordedCodes = new Set(spotPositions.map((p) => p.krCode));
    const fromLedger = spotPositions.reduce((s, p) => s + p.investedKrw, 0);
    const fromPairs = activePairs
      .filter((p) => !recordedCodes.has(p.krLeg.krCode))
      .reduce((s, p) => s + p.krLeg.quantity * p.krLeg.avgPriceKrw, 0);
    return fromLedger + fromPairs;
  }, [spotPositions, activePairs]);
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
  // 자본이 아직 로딩 중(0)이면 APR 컬럼은 — 처리해 순간적인 0% 표시를 막는다.
  const reliable = capitalForRows > 0 && isAprReliable(stats.elapsedDays * 24, stats.settlementCount);

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
        usdtKrw={snapshot?.fx.usdtKrwUpbit ?? null}
        loading={loading && equityLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <PeriodTable title="월별 기록" rows={monthlyRows} period="month" defaultVisible={12} aprReliable={reliable} />
        <PeriodTable title="일별 기록" rows={dailyRows} period="day" defaultVisible={10} aprReliable={reliable} />
      </div>

      <HourlyTable events={events} />

      <CapitalLedger addresses={addresses} onChange={onCapitalChange} />

      <SpotTradeLedger snapshot={snapshot} onChange={() => setSpotVersion((v) => v + 1)} />

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
