"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { loadTickerMap } from "@/lib/tickerMap";

const POLL_MS = 5000;

export function useLiveSnapshot() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const cancelledRef = useRef(false);

  const load = useCallback(async () => {
    setRefreshing(true);
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
      if (!cancelledRef.current) {
        setSnapshot(data);
        setError(null);
        setLastUpdated(Date.now());
      }
    } catch (err) {
      if (!cancelledRef.current) setError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      if (!cancelledRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(timer);
    };
  }, [load]);

  return { snapshot, error, lastUpdated, refreshing, refetch: load };
}
