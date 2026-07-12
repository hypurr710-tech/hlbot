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
