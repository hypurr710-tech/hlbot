"use client";
import { useEffect, useState } from "react";
import type { KrLeg } from "@/lib/arbStore";
import { getTickerByHl } from "@/lib/tickerMap";

interface Props {
  hlAddress: string;
  hlSymbol: string;
  initial?: KrLeg;
  initialOpenedAt?: number;
  onSave: (leg: KrLeg, openedAt: number) => void;
  onCancel: () => void;
}

/** ms → "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
function toLocalInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function PairEditModal({ hlAddress, hlSymbol, initial, initialOpenedAt, onSave, onCancel }: Props) {
  const suggested = getTickerByHl(hlSymbol);
  const [krCode, setKrCode] = useState(initial?.krCode ?? suggested?.krCode ?? "");
  const [krName, setKrName] = useState(initial?.krName ?? suggested?.krName ?? "");
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? ""));
  const [avgPrice, setAvgPrice] = useState(String(initial?.avgPriceKrw ?? ""));
  const [brokerLabel, setBrokerLabel] = useState(initial?.brokerLabel ?? "");
  const [openedAt, setOpenedAt] = useState(toLocalInput(initialOpenedAt ?? Date.now()));

  const openedAtMs = (() => {
    const t = new Date(openedAt).getTime();
    return Number.isFinite(t) ? t : Date.now();
  })();

  const canSave =
    krCode.length > 0 &&
    krName.length > 0 &&
    parseFloat(quantity) > 0 &&
    parseFloat(avgPrice) > 0 &&
    Number.isFinite(new Date(openedAt).getTime());

  // Close on ESC — matches the backdrop-click affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="bg-hl-bg-secondary border border-hl-border rounded-xl p-6 w-full max-w-md space-y-4 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-hl-text-primary">
            Pair {hlSymbol} with KR spot
          </h3>
          <p className="text-xs text-hl-text-tertiary mt-1 font-mono">
            wallet {hlAddress.slice(0, 6)}...{hlAddress.slice(-4)}
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs text-hl-text-tertiary mb-1">KR code</label>
            <input value={krCode} onChange={(e) => setKrCode(e.target.value)}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary" />
          </div>
          <div>
            <label className="block text-xs text-hl-text-tertiary mb-1">KR name</label>
            <input value={krName} onChange={(e) => setKrName(e.target.value)}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 text-hl-text-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hl-text-tertiary mb-1">Quantity (shares)</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary" />
            </div>
            <div>
              <label className="block text-xs text-hl-text-tertiary mb-1">Avg price (KRW)</label>
              <input type="number" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)}
                className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hl-text-tertiary mb-1">
              포지션 오픈 시각 <span className="text-hl-text-tertiary/60">(HL 숏 진입 시점)</span>
            </label>
            <input type="datetime-local" value={openedAt} onChange={(e) => setOpenedAt(e.target.value)}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary" />
            <p className="text-[10px] text-hl-text-tertiary mt-1">
              실현 펀딩·경과 시간을 이 시점부터 집계합니다. 실제 진입 시각으로 맞추세요.
            </p>
          </div>
          <div>
            <label className="block text-xs text-hl-text-tertiary mb-1">Broker (optional)</label>
            <input value={brokerLabel} onChange={(e) => setBrokerLabel(e.target.value)}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 text-hl-text-primary" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-xs text-hl-text-secondary hover:text-hl-text-primary">
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={() =>
              onSave(
                {
                  krCode,
                  krName,
                  quantity: parseFloat(quantity),
                  avgPriceKrw: parseFloat(avgPrice),
                  entryTs: initial?.entryTs ?? openedAtMs,
                  brokerLabel: brokerLabel || undefined,
                },
                openedAtMs
              )
            }
            className="px-4 py-1.5 text-xs font-semibold rounded bg-hl-accent text-hl-bg-primary disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
