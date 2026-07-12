"use client";
import { useEffect, useState } from "react";
import { getUserFunding, type FundingEvent } from "@/lib/hyperliquid";

const ONE_YEAR_AGO = () => Date.now() - 365 * 24 * 60 * 60 * 1000;

interface Cache {
  ts: number;
  events: FundingEvent[];
}
const cache = new Map<string, Cache>();
const CACHE_TTL_MS = 60 * 1000; // 60s per wallet

/**
 * Fetch funding events for a wallet with a 60s in-memory cache.
 * The cache is keyed by lowercased address so re-renders / multiple pairs
 * on the same wallet share a single API request.
 */
export async function fetchFundingWithCache(address: string): Promise<FundingEvent[]> {
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.events;
  const events = await getUserFunding(address, ONE_YEAR_AGO(), "xyz");
  cache.set(key, { ts: Date.now(), events });
  return events;
}

export function useFundingHistory(address: string | null): {
  events: FundingEvent[];
  loading: boolean;
  error: string | null;
} {
  const [events, setEvents] = useState<FundingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) { setEvents([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchFundingWithCache(address)
      .then((e) => {
        if (cancelled) return;
        setEvents(e);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "fetch failed");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [address]);

  return { events, loading, error };
}
