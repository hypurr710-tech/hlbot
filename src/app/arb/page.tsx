"use client";
import { useMemo } from "react";
import { useLiveSnapshot } from "./useLiveSnapshot";
import { useHlXyzShorts } from "./useHlXyzShorts";
import LedgerPanel from "./LedgerPanel";
import ScannerPanel from "./ScannerPanel";
import SummaryStrip from "./SummaryStrip";

export default function ArbPage() {
  const { snapshot, error } = useLiveSnapshot();
  const shorts = useHlXyzShorts();

  const shortsByKey = useMemo(() => {
    const m: Record<string, { sizeAbs: number; cumFundingUsd: number }> = {};
    for (const s of shorts) {
      m[`${s.hlAddress.toLowerCase()}|${s.hlSymbol}`] = {
        sizeAbs: s.sizeAbs,
        cumFundingUsd: s.cumFundingUsd,
      };
    }
    return m;
  }, [shorts]);

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
        {snapshot && (
          <div className="text-xs text-hl-text-tertiary font-mono">
            USDT/KRW {snapshot.fx.usdtKrwUpbit?.toFixed(2) ?? "—"} · USD/KRW{" "}
            {snapshot.fx.usdKrwHana?.toFixed(2) ?? "—"}
          </div>
        )}
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

      <SummaryStrip snapshot={snapshot} hlPositionsBySymbol={shortsByKey} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-lg font-semibold text-hl-text-primary mb-4">My Ledger</h2>
          <LedgerPanel snapshot={snapshot} shorts={shorts} />
        </section>
        <section>
          <h2 className="text-lg font-semibold text-hl-text-primary mb-4">Opportunity Scanner</h2>
          <ScannerPanel snapshot={snapshot} />
        </section>
      </div>

      <footer className="pt-8 mt-8 border-t border-hl-border text-[11px] text-hl-text-tertiary font-mono leading-relaxed">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <div>
            <span className="text-hl-text-secondary font-semibold">Data sources</span>
            <ul className="mt-1 space-y-0.5">
              <li>· Perp mark / funding: <span className="text-hl-accent">api.hyperliquid.xyz</span> (metaAndAssetCtxs, xyz dex)</li>
              <li>· KR 현물 종가 / NXT: <span className="text-hl-accent">m.stock.naver.com</span></li>
              <li>· USDT/KRW: <span className="text-hl-accent">api.upbit.com</span></li>
              <li>· USD/KRW: <span className="text-hl-accent">finance.naver.com</span> (하나은행 기준)</li>
            </ul>
          </div>
          <div>
            <span className="text-hl-text-secondary font-semibold">계산식</span>
            <ul className="mt-1 space-y-0.5">
              <li>· 프리미엄 = (HL × USDT/KRW − KR 라이브가) / KR 라이브가</li>
              <li>· 투입자본 = HL 노셔널 + KR 원금 (하나은행 환율 USD 환산)</li>
              <li>· 델타중립 판정: |불일치| &lt; 3%</li>
              <li>· 갱신 주기 5s · KR 라이브가 = 정규장 열림 시 종가필드, 마감 후 NXT</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
