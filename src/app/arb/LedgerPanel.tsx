"use client";
import { useMemo, useState } from "react";
import { useArbPairs } from "@/hooks/useArbPairs";
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
        <div className="text-sm text-hl-text-tertiary p-6 text-center bg-hl-bg-secondary border border-hl-border rounded-xl">
          No arb pairs yet. Add a wallet with an HL xyz short in <b>Addresses</b>, then pair it here.
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
