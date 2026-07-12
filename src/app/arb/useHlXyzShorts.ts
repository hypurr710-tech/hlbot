"use client";
import { useEffect, useState } from "react";
import { useAddresses } from "@/lib/store";
import { getClearinghouseState } from "@/lib/hyperliquid";

export interface HlShortSnap {
  hlAddress: string;
  hlSymbol: string;
  sizeAbs: number;
  cumFundingUsd: number;
}

async function fetchForAddress(address: string): Promise<HlShortSnap[]> {
  const state = await getClearinghouseState(address, "xyz");
  const out: HlShortSnap[] = [];
  for (const ap of state.assetPositions ?? []) {
    const p = ap.position;
    const size = parseFloat(p.szi);
    if (size >= 0) continue;
    const rawSymbol = p.coin.includes(":") ? p.coin : `xyz:${p.coin}`;
    out.push({
      hlAddress: address,
      hlSymbol: rawSymbol,
      sizeAbs: Math.abs(size),
      cumFundingUsd: -parseFloat(p.cumFunding.sinceOpen),
    });
  }
  return out;
}

export function useHlXyzShorts() {
  const { addresses } = useAddresses();
  const [shorts, setShorts] = useState<HlShortSnap[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(
        addresses.map((a) => fetchForAddress(a.address).catch(() => []))
      );
      if (!cancelled) setShorts(results.flat());
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [addresses]);

  return shorts;
}
