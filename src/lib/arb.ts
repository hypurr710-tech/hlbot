import type { KrQuote } from "./aggregator/types";

/**
 * Pick the KR price that best reflects "current" market:
 * - Regular hours: kr.close is the live intraday price
 * - After hours with NXT open: use NXT price
 * - Otherwise: fall back to regular close
 */
export function selectLiveKrPrice(kr: KrQuote): number {
  if (kr.marketOpen) return kr.close;
  if (kr.nxtPrice != null && kr.nxtPrice > 0) return kr.nxtPrice;
  return kr.close;
}

export function isLiveKrFromNxt(kr: KrQuote): boolean {
  return !kr.marketOpen && kr.nxtPrice != null && kr.nxtPrice > 0;
}

export function hlPriceKrw(hlMarkUsd: number, usdtKrw: number): number {
  return hlMarkUsd * usdtKrw;
}

export function calcPremiumPct(args: {
  hlMarkUsd: number;
  usdtKrw: number;
  krCloseKrw: number;
}): number {
  const { hlMarkUsd, usdtKrw, krCloseKrw } = args;
  if (krCloseKrw === 0) return 0;
  const hlKrw = hlPriceKrw(hlMarkUsd, usdtKrw);
  return ((hlKrw - krCloseKrw) / krCloseKrw) * 100;
}

export function calcCapitalUsd(args: {
  hlSizeAbs: number;
  hlMarkUsd: number;
  krQuantity: number;
  krAvgPriceKrw: number;
  usdKrwHana: number;
}): number {
  const { hlSizeAbs, hlMarkUsd, krQuantity, krAvgPriceKrw, usdKrwHana } = args;
  const hlNotional = hlSizeAbs * hlMarkUsd;
  const krCostKrw = krQuantity * krAvgPriceKrw;
  const krCostUsd = usdKrwHana > 0 ? krCostKrw / usdKrwHana : 0;
  return hlNotional + krCostUsd;
}

export function calcAprPct(args: {
  hlNotionalUsd: number;
  fundingHourly: number;
  capitalUsd: number;
}): number {
  const { hlNotionalUsd, fundingHourly, capitalUsd } = args;
  if (capitalUsd === 0) return 0;
  const perHourUsd = hlNotionalUsd * fundingHourly;
  const perYearUsd = perHourUsd * 24 * 365;
  return (perYearUsd / capitalUsd) * 100;
}

export function calcDeltaMismatchPct(args: {
  hlSizeAbs: number;
  hlMarkUsd: number;
  krQuantity: number;
  krCloseKrw: number;
  usdKrwHana: number;
}): number {
  const { hlSizeAbs, hlMarkUsd, krQuantity, krCloseKrw, usdKrwHana } = args;
  const hlNotional = hlSizeAbs * hlMarkUsd;
  const krNotionalUsd = usdKrwHana > 0 ? (krQuantity * krCloseKrw) / usdKrwHana : 0;
  if (krNotionalUsd === 0) return hlNotional === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((hlNotional - krNotionalUsd) / krNotionalUsd) * 100;
}

export const DELTA_NEUTRAL_THRESHOLD_PCT = 3;

export function isDeltaNeutral(mismatchPct: number): boolean {
  return Math.abs(mismatchPct) < DELTA_NEUTRAL_THRESHOLD_PCT;
}

/** Real APR from actual accumulated funding over actual elapsed time. */
export function calcRealizedAprPct(args: {
  totalFundingUsd: number;
  capitalUsd: number;
  elapsedHours: number;
}): number {
  const { totalFundingUsd, capitalUsd, elapsedHours } = args;
  if (capitalUsd <= 0 || elapsedHours <= 0) return 0;
  const perHour = totalFundingUsd / elapsedHours;
  const perYear = perHour * 24 * 365;
  return (perYear / capitalUsd) * 100;
}

/** Absolute return % of accumulated funding vs capital. */
export function calcTotalReturnPct(totalFundingUsd: number, capitalUsd: number): number {
  if (capitalUsd <= 0) return 0;
  return (totalFundingUsd / capitalUsd) * 100;
}

/** Bucket funding events into hourly/daily/monthly aggregates. */
export type FundingPeriod = "hour" | "day" | "month";

export interface FundingBucket {
  key: string;         // ISO-ish label: "2026-07-12T14", "2026-07-12", "2026-07"
  ts: number;          // ms of bucket start
  usdc: number;        // sum of usdc in bucket
  count: number;       // number of events in bucket
}

export function aggregateFundingByPeriod(
  events: Array<{ time: number; usdc: number }>,
  period: FundingPeriod
): FundingBucket[] {
  const buckets = new Map<string, FundingBucket>();
  for (const e of events) {
    const d = new Date(e.time);
    let key: string;
    let ts: number;
    if (period === "hour") {
      const hourStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime();
      key = new Date(hourStart).toISOString().slice(0, 13);
      ts = hourStart;
    } else if (period === "day") {
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      key = new Date(dayStart).toISOString().slice(0, 10);
      ts = dayStart;
    } else {
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      key = new Date(monthStart).toISOString().slice(0, 7);
      ts = monthStart;
    }
    const b = buckets.get(key);
    if (b) { b.usdc += e.usdc; b.count += 1; }
    else buckets.set(key, { key, ts, usdc: e.usdc, count: 1 });
  }
  return Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);
}
