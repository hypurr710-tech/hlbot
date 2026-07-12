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
