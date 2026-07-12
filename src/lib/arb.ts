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

const pad2 = (n: number) => String(n).padStart(2, "0");

export function aggregateFundingByPeriod(
  events: Array<{ time: number; usdc: number }>,
  period: FundingPeriod
): FundingBucket[] {
  const buckets = new Map<string, FundingBucket>();
  for (const e of events) {
    const d = new Date(e.time);
    const y = d.getFullYear();
    const mo = d.getMonth();
    const day = d.getDate();
    // Labels are derived from LOCAL calendar components (not toISOString, which
    // is UTC and shifts the label by the timezone offset — e.g. KST would render
    // the previous day / 9 hours earlier).
    let key: string;
    let ts: number;
    if (period === "hour") {
      ts = new Date(y, mo, day, d.getHours()).getTime();
      key = `${y}-${pad2(mo + 1)}-${pad2(day)} ${pad2(d.getHours())}`;
    } else if (period === "day") {
      ts = new Date(y, mo, day).getTime();
      key = `${y}-${pad2(mo + 1)}-${pad2(day)}`;
    } else {
      ts = new Date(y, mo, 1).getTime();
      key = `${y}-${pad2(mo + 1)}`;
    }
    const b = buckets.get(key);
    if (b) { b.usdc += e.usdc; b.count += 1; }
    else buckets.set(key, { key, ts, usdc: e.usdc, count: 1 });
  }
  return Array.from(buckets.values()).sort((a, b) => a.ts - b.ts);
}

/**
 * Forward-looking APR from the funding actually collected over a trailing
 * window (default caller passes 24h). Unlike the instantaneous 1h rate, this
 * smooths hour-to-hour funding noise. When the position is younger than the
 * window, it annualizes over the elapsed time so a fresh position isn't diluted
 * by counting hours before it existed.
 */
export function calcRecentAprPct(args: {
  events: Array<{ time: number; usdc: number }>;
  capitalUsd: number;
  windowHours: number;
  nowMs: number;
  openedAtMs: number;
}): number {
  const { events, capitalUsd, windowHours, nowMs, openedAtMs } = args;
  if (capitalUsd <= 0) return 0;
  const windowStart = Math.max(nowMs - windowHours * 3600000, openedAtMs);
  const effectiveHours = (nowMs - windowStart) / 3600000;
  if (effectiveHours <= 0) return 0;
  const sum = events
    .filter((e) => e.time >= windowStart)
    .reduce((s, e) => s + e.usdc, 0);
  const perYear = (sum / effectiveHours) * 24 * 365;
  return (perYear / capitalUsd) * 100;
}

/**
 * Whether an annualized APR is statistically meaningful yet. Right after open a
 * single funding sample annualizes to absurd values, so we gate the display on a
 * minimum elapsed window and settlement count.
 */
export function isAprReliable(elapsedHours: number, settlementCount: number): boolean {
  return elapsedHours >= 24 && settlementCount >= 3;
}
