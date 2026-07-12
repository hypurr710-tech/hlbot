"use client";
import { useEffect, useRef, useState } from "react";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { loadTickerMap } from "@/lib/tickerMap";

const POLL_MS = 5000;

export function useLiveSnapshot() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const tickers = loadTickerMap()
          .map((t) => `${t.hlSymbol}:${t.krCode}`)
          .join(",");
        const url = tickers
          ? `/api/aggregator?tickers=${encodeURIComponent(tickers)}`
          : "/api/aggregator";
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LiveSnapshot;
        if (!cancelled) {
          setSnapshot(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "fetch failed");
      }
    };
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return { snapshot, error };
}
