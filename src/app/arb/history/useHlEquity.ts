"use client";
import { useEffect, useState } from "react";
import { getClearinghouseState } from "@/lib/hyperliquid";

/** 지갑 하나의 HL 예치금 = 일반 perp accountValue + xyz dex accountValue. */
async function fetchEquity(address: string): Promise<number> {
  const [std, xyz] = await Promise.all([
    getClearinghouseState(address).catch(() => null),
    getClearinghouseState(address, "xyz").catch(() => null),
  ]);
  const v = (s: { crossMarginSummary: { accountValue: string } } | null) =>
    s ? parseFloat(s.crossMarginSummary.accountValue) : 0;
  return v(std) + v(xyz);
}

export function useHlEquity(addresses: string[]): {
  totalEquityUsd: number | null;
  loading: boolean;
} {
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const key = addresses.join(",");

  useEffect(() => {
    if (addresses.length === 0) { setTotal(0); setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      const sums = await Promise.all(addresses.map((a) => fetchEquity(a).catch(() => 0)));
      if (cancelled) return;
      setTotal(sums.reduce((s, v) => s + v, 0));
      setLoading(false);
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { totalEquityUsd: total, loading };
}
