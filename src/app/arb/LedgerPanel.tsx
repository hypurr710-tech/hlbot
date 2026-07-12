"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useArbPairs } from "@/hooks/useArbPairs";
import { useAddresses } from "@/lib/store";
import LedgerCard from "./LedgerCard";
import UnhedgedList, { type UnhedgedShort } from "./UnhedgedList";
import PairEditModal from "./PairEditModal";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import type { ArbPair, KrLeg } from "@/lib/arbStore";
import type { HlShortSnap } from "./useHlXyzShorts";
import type { FundingEvent } from "@/lib/hyperliquid";
import { selectLiveKrPrice, isLiveKrFromNxt } from "@/lib/arb";

interface Props {
  snapshot: LiveSnapshot | null;
  shorts: HlShortSnap[];
  fundingByAddress: Record<string, FundingEvent[]>;
}

export default function LedgerPanel({ snapshot, shorts, fundingByAddress }: Props) {
  const { pairs, addPair, updatePair, closePair } = useArbPairs();
  const { addresses } = useAddresses();
  const [modalState, setModalState] = useState<
    | { mode: "create"; short: UnhedgedShort }
    | { mode: "edit"; pair: ArbPair }
    | null
  >(null);

  const activePairs = useMemo(() => pairs.filter((p) => !p.closedAt), [pairs]);
  const pairedKeys = useMemo(
    () => new Set(activePairs.map((p) => `${p.hlAddress.toLowerCase()}|${p.hlSymbol}`)),
    [activePairs]
  );
  const unhedged: UnhedgedShort[] = shorts
    .filter((s) => !pairedKeys.has(`${s.hlAddress.toLowerCase()}|${s.hlSymbol}`))
    .map((s) => ({
      hlAddress: s.hlAddress,
      hlSymbol: s.hlSymbol,
      sizeAbs: s.sizeAbs,
      markPx: snapshot?.hl[s.hlSymbol]?.markPx ?? 0,
    }));

  const handleSave = (leg: KrLeg, openedAt: number) => {
    if (modalState?.mode === "create") {
      addPair({
        hlAddress: modalState.short.hlAddress,
        hlSymbol: modalState.short.hlSymbol,
        krLeg: leg,
        openedAt,
      });
    } else if (modalState?.mode === "edit") {
      updatePair(modalState.pair.id, { krLeg: leg, openedAt });
    }
    setModalState(null);
  };

  return (
    <div>
      <UnhedgedList
        shorts={unhedged}
        onPairUp={(s) => setModalState({ mode: "create", short: s })}
      />

      {activePairs.length === 0 && unhedged.length === 0 && (
        <div className="p-8 text-center bg-hl-bg-secondary border border-hl-border rounded-xl space-y-4">
          {addresses.length === 0 ? (
            <>
              <div className="text-sm text-hl-text-secondary">
                등록된 지갑 없음
              </div>
              <div className="text-xs text-hl-text-tertiary">
                Hyperliquid 지갑을 등록하세요
              </div>
              <Link
                href="/address"
                className="inline-block px-4 py-2 bg-hl-accent text-hl-bg-primary rounded-lg text-sm font-semibold hover:bg-hl-accent/90 transition-colors"
              >
                지갑 등록
              </Link>
            </>
          ) : (
            <>
              <div className="text-sm text-hl-text-secondary">
                xyz dex 숏 포지션 없음
              </div>
              <div className="text-xs text-hl-text-tertiary">
                Hyperliquid에서 국내주식 perp 숏을 진입하면 자동 표시됩니다
              </div>
              <a
                href="https://app.hyperliquid.xyz/trade/xyz:SKHX"
                target="_blank"
                rel="noopener"
                className="inline-block px-4 py-2 border border-hl-border text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light rounded-lg text-xs font-medium transition-colors"
              >
                Hyperliquid 열기 ↗
              </a>
            </>
          )}
        </div>
      )}

      <div className="space-y-4">
        {activePairs.map((pair) => {
          const hl = snapshot?.hl[pair.hlSymbol];
          const kr = snapshot?.kr[pair.hlSymbol];
          const hlPos = shorts.find(
            (s) => s.hlAddress.toLowerCase() === pair.hlAddress.toLowerCase() && s.hlSymbol === pair.hlSymbol
          );
          if (!hl || !kr || !hlPos || snapshot?.fx.usdKrwHana == null || snapshot?.fx.usdtKrwUpbit == null) {
            return (
              <div key={pair.id} className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 text-xs text-hl-text-tertiary">
                {pair.hlSymbol} / {pair.krLeg.krCode} — waiting for live data…
              </div>
            );
          }
          const krLive = selectLiveKrPrice(kr);
          const krSource: "regular" | "nxt" = isLiveKrFromNxt(kr) ? "nxt" : "regular";

          // Filter funding events to this pair's symbol.
          // Coin may be "xyz:SKHX" (HIP-3) or "SKHX" (bare) depending on API/dex — accept both.
          const walletEvents = fundingByAddress[pair.hlAddress.toLowerCase()] ?? [];
          const symbolShort = pair.hlSymbol.split(":").pop() ?? pair.hlSymbol;
          const pairEvents = walletEvents
            .filter((e) => e.delta.coin === pair.hlSymbol || e.delta.coin === symbolShort)
            .map((e) => ({ time: e.time, usdc: parseFloat(e.delta.usdc) }));

          return (
            <LedgerCard
              key={pair.id}
              pair={pair}
              hlSizeAbs={hlPos.sizeAbs}
              hlMarkUsd={hl.markPx}
              fundingHourly={hl.fundingHourly}
              cumFundingUsd={hlPos.cumFundingUsd}
              krLivePriceKrw={krLive}
              krPriceSource={krSource}
              usdKrwHana={snapshot.fx.usdKrwHana}
              usdtKrwUpbit={snapshot.fx.usdtKrwUpbit}
              krName={pair.krLeg.krName}
              krNxtSession={kr.nxtSession}
              realizedFundingEvents={pairEvents}
              onEdit={() => setModalState({ mode: "edit", pair })}
              onClose={() => closePair(pair.id)}
            />
          );
        })}
      </div>

      {modalState?.mode === "create" && (
        <PairEditModal
          hlAddress={modalState.short.hlAddress}
          hlSymbol={modalState.short.hlSymbol}
          onSave={handleSave}
          onCancel={() => setModalState(null)}
        />
      )}
      {modalState?.mode === "edit" && (
        <PairEditModal
          hlAddress={modalState.pair.hlAddress}
          hlSymbol={modalState.pair.hlSymbol}
          initial={modalState.pair.krLeg}
          initialOpenedAt={modalState.pair.openedAt ?? modalState.pair.createdAt}
          onSave={handleSave}
          onCancel={() => setModalState(null)}
        />
      )}
    </div>
  );
}
