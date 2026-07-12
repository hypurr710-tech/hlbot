import { describe, it, expect } from "vitest";
import { calcPremiumPct, hlPriceKrw } from "@/lib/arb";

describe("arb.calcPremiumPct", () => {
  it("computes positive premium when HL is more expensive than KRX", () => {
    // HL SKHX $1474.85, USDT/KRW 1503.4, KR spot 2,180,000
    // hlKrw = 1474.85 * 1503.4 = 2,217,289.49
    // premium = (2217289.49 − 2180000) / 2180000 = 0.01711 → 1.71%
    const p = calcPremiumPct({
      hlMarkUsd: 1474.85,
      usdtKrw: 1503.4,
      krCloseKrw: 2180000,
    });
    expect(p).toBeCloseTo(1.71, 1);
  });

  it("returns negative premium when KRX is more expensive", () => {
    const p = calcPremiumPct({ hlMarkUsd: 1000, usdtKrw: 1500, krCloseKrw: 1600000 });
    expect(p).toBeLessThan(0);
  });

  it("returns 0 for equal prices", () => {
    const p = calcPremiumPct({ hlMarkUsd: 1000, usdtKrw: 1500, krCloseKrw: 1500000 });
    expect(p).toBeCloseTo(0, 5);
  });

  it("hlPriceKrw converts USD to KRW via USDT rate", () => {
    // 1474.85 * 1503.4 = 2,217,289.49
    expect(hlPriceKrw(1474.85, 1503.4)).toBeCloseTo(2217289.49, 1);
  });
});
