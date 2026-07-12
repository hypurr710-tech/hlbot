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

interface Props {
  snapshot: LiveSnapshot | null;
  shorts: HlShortSnap[];
}

export default function LedgerPanel({ snapshot, shorts }: Props) {
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

  const handleSave = (leg: KrLeg) => {
    if (modalState?.mode === "create") {
      addPair({
        hlAddress: modalState.short.hlAddress,
        hlSymbol: modalState.short.hlSymbol,
        krLeg: leg,
      });
    } else if (modalState?.mode === "edit") {
      updatePair(modalState.pair.id, { krLeg: leg });
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
                아직 지갑이 등록되어 있지 않아요.
              </div>
              <div className="text-xs text-hl-text-tertiary">
                Hyperliquid xyz dex에서 숏을 잡고 있는 지갑 주소를 먼저 추가해줘.
              </div>
              <Link
                href="/address"
                className="inline-block px-4 py-2 bg-hl-accent text-hl-bg-primary rounded-lg text-sm font-semibold hover:bg-hl-accent/90 transition-colors"
              >
                지갑 주소 추가하기 →
              </Link>
            </>
          ) : (
            <>
              <div className="text-sm text-hl-text-secondary">
                등록된 지갑에 xyz dex 숏 포지션이 없어요.
              </div>
              <div className="text-xs text-hl-text-tertiary">
                Hyperliquid에서 <code className="text-hl-accent">xyz:SKHX</code> 같은 국내주식 perp을 1x 숏 잡으면 여기 표시돼.
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
          return (
            <LedgerCard
              key={pair.id}
              pair={pair}
              hlSizeAbs={hlPos.sizeAbs}
              hlMarkUsd={hl.markPx}
              fundingHourly={hl.fundingHourly}
              cumFundingUsd={hlPos.cumFundingUsd}
              krCloseKrw={kr.close}
              usdKrwHana={snapshot.fx.usdKrwHana}
              usdtKrwUpbit={snapshot.fx.usdtKrwUpbit}
              krName={pair.krLeg.krName}
              krNxtPrice={kr.nxtPrice}
              krNxtSession={kr.nxtSession}
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
          onSave={handleSave}
          onCancel={() => setModalState(null)}
        />
      )}
    </div>
  );
}
