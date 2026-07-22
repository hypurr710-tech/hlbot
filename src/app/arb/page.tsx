"use client";
import { useEffect, useMemo, useState } from "react";
import { useLiveSnapshot } from "./useLiveSnapshot";
import { useHlXyzShorts } from "./useHlXyzShorts";
import { useArbPairs } from "@/hooks/useArbPairs";
import { pairOpenedAt } from "@/lib/arbStore";
import { fetchFundingWithCache } from "./useFundingHistory";
import type { FundingEvent } from "@/lib/hyperliquid";
import LedgerPanel from "./LedgerPanel";
import ScannerPanel from "./ScannerPanel";
import { calcKimchiPct } from "@/lib/arb";

export default function ArbPage() {
  const { snapshot, error, lastUpdated, refreshing, refetch } = useLiveSnapshot();
  const shorts = useHlXyzShorts();
  const { pairs } = useArbPairs();

  // Unique wallet addresses for pairs currently in play — fetch userFunding for each.
  const activePairs = useMemo(() => pairs.filter((p) => !p.closedAt), [pairs]);
  const uniqueAddresses = useMemo(
    () => Array.from(new Set(activePairs.map((p) => p.hlAddress.toLowerCase()))).sort(),
    [activePairs]
  );
  const uniqueAddressesKey = uniqueAddresses.join(",");

  const [fundingByAddress, setFundingByAddress] = useState<Record<string, FundingEvent[]>>({});

  useEffect(() => {
    if (uniqueAddresses.length === 0) {
      setFundingByAddress({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(
        uniqueAddresses.map(async (addr) => {
          try {
            const events = await fetchFundingWithCache(addr);
            return [addr, events] as const;
          } catch {
            return [addr, [] as FundingEvent[]] as const;
          }
        })
      );
      if (cancelled) return;
      const m: Record<string, FundingEvent[]> = {};
      for (const [addr, events] of results) m[addr] = events;
      setFundingByAddress(m);
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueAddressesKey]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
            Funding Arbitrage
          </h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            Hyperliquid × KRX 델타 헤지 원장
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {snapshot && (
            <div className="text-xs text-hl-text-tertiary font-mono">
              USDT/KRW {snapshot.fx.usdtKrwUpbit?.toFixed(2) ?? "—"}
              {snapshot.fx.usdtKrwUpbit != null && snapshot.fx.usdKrwHana != null && (
                <span className={calcKimchiPct(snapshot.fx.usdtKrwUpbit, snapshot.fx.usdKrwHana) >= 0 ? "text-hl-green" : "text-hl-red"}>
                  {" "}(김프 {calcKimchiPct(snapshot.fx.usdtKrwUpbit, snapshot.fx.usdKrwHana) >= 0 ? "+" : ""}
                  {calcKimchiPct(snapshot.fx.usdtKrwUpbit, snapshot.fx.usdKrwHana).toFixed(2)}%)
                </span>
              )}
              {" "}· USD/KRW {snapshot.fx.usdKrwHana?.toFixed(2) ?? "—"}
            </div>
          )}
          <FreshnessIndicator
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            hasError={!!error}
            onRefresh={refetch}
          />
        </div>
      </div>

      {error && (
        <div className="bg-hl-red/10 border border-hl-red/30 text-hl-red text-sm p-3 rounded-lg">
          Aggregator error: {error}
        </div>
      )}
      {snapshot && snapshot.warnings.length > 0 && (
        <div className="bg-hl-yellow/10 border border-hl-yellow/30 text-hl-yellow text-xs p-2 rounded-lg font-mono">
          Warnings: {snapshot.warnings.join(", ")}
        </div>
      )}

      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
            Opportunity Scanner
          </h2>
          <span className="text-xs text-hl-text-tertiary">델타중립 진입 후보 · 펀딩 파밍</span>
        </div>
        <ScannerPanel snapshot={snapshot} />
      </section>

      <section className="pt-2">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-xl md:text-2xl font-semibold text-hl-text-primary">My Ledger</h2>
          <span className="text-xs text-hl-text-tertiary">보유 델타중립 포지션</span>
        </div>
        <LedgerPanel
          snapshot={snapshot}
          shorts={shorts}
          fundingByAddress={fundingByAddress}
        />
      </section>

      <footer className="pt-8 mt-8 border-t border-hl-border text-[11px] text-hl-text-tertiary font-mono leading-relaxed">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <span className="text-hl-text-secondary font-semibold">Data sources</span>
            <ul className="mt-1 space-y-0.5">
              <li>· Perp mark / funding: <span className="text-hl-accent">api.hyperliquid.xyz</span> (metaAndAssetCtxs, xyz dex)</li>
              <li>· 실현 펀딩 이벤트: <span className="text-hl-accent">api.hyperliquid.xyz</span> (userFunding, coin 필터)</li>
              <li>· KR 현물 종가 / NXT: <span className="text-hl-accent">m.stock.naver.com</span></li>
              <li>· USDT/KRW: <span className="text-hl-accent">api.upbit.com</span></li>
              <li>· USD/KRW: <span className="text-hl-accent">finance.naver.com</span> (하나은행 기준)</li>
            </ul>
          </div>
          <div>
            <span className="text-hl-text-secondary font-semibold">계산식</span>
            <ul className="mt-1 space-y-0.5">
              <li>· 실효 APR = 지금까지 받은 펀딩을 경과 시간으로 나눠 시간당 수익을 구하고, 1년치(×8760 = 24시간×365일)로 환산해 자본으로 나눈 값</li>
              <li>· 예상 APR = 현재 시간당 펀딩률이 1년간 유지된다고 가정했을 때의 예상 연 수익률</li>
              <li>· 프리미엄 = HL 가격을 원화로 환산한 값이 국내 실시간가보다 몇 % 비싼지 (국내 실시간가 = 장중엔 현재가, 장 마감 후엔 NXT 시간외가)</li>
              <li>· 델타중립 판정: |불일치| &lt; 3%</li>
              <li>· 갱신 주기 5초(가격) / 60초(펀딩 이벤트)</li>
              <li className="text-hl-yellow/70">· 모든 수익률은 <span className="font-semibold">gross</span> — HL 수수료·국내 거래세·환전 스프레드 미반영</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FreshnessIndicator({
  lastUpdated,
  refreshing,
  hasError,
  onRefresh,
}: {
  lastUpdated: number | null;
  refreshing: boolean;
  hasError: boolean;
  onRefresh: () => void;
}) {
  // Re-render every second so the "N초 전" age stays live between polls.
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const ageSec = lastUpdated != null ? Math.max(0, Math.round((Date.now() - lastUpdated) / 1000)) : null;
  const stale = ageSec != null && ageSec > 15;
  const dotColor = hasError ? "bg-hl-red" : stale ? "bg-hl-yellow" : "bg-hl-green";
  const ageLabel =
    ageSec == null ? "연결 중…" : ageSec < 2 ? "방금" : ageSec < 60 ? `${ageSec}초 전` : `${Math.floor(ageSec / 60)}분 전`;

  return (
    <div className="flex items-center gap-2 text-[11px] text-hl-text-tertiary font-mono">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor} ${!hasError && !stale ? "pulse-green" : ""}`} />
      <span>{hasError ? "연결 오류" : `LIVE · ${ageLabel}`}</span>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        title="지금 새로고침"
        className="px-1.5 py-0.5 rounded border border-hl-border text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light disabled:opacity-40 transition-colors"
      >
        <span className={`inline-block ${refreshing ? "animate-spin" : ""}`}>↻</span>
      </button>
    </div>
  );
}
