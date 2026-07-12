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

import { calcCapitalUsd, calcAprPct } from "@/lib/arb";

describe("arb.calcCapitalUsd", () => {
  it("sums HL notional and KR spot cost", () => {
    // HL: 1 unit × $1474.85 = $1474.85
    // KR: 1 share × ₩2,170,000 / 1494 (hana) = $1452.48
    const c = calcCapitalUsd({
      hlSizeAbs: 1,
      hlMarkUsd: 1474.85,
      krQuantity: 1,
      krAvgPriceKrw: 2170000,
      usdKrwHana: 1494,
    });
    expect(c).toBeCloseTo(2927.33, 1);
  });

  it("returns 0 when both sides are 0", () => {
    expect(calcCapitalUsd({
      hlSizeAbs: 0, hlMarkUsd: 100, krQuantity: 0, krAvgPriceKrw: 100, usdKrwHana: 1000
    })).toBe(0);
  });
});

describe("arb.calcAprPct", () => {
  it("annualizes hourly funding against total capital", () => {
    // Notional $1474.85, funding 0.0055%/h = 0.000055, capital $2927.33
    // fundingUsd/h = 1474.85 * 0.000055 = 0.081117
    // annual = 0.081117 * 8760 = 710.58
    // APR = 710.58 / 2927.33 = 24.27%
    const apr = calcAprPct({
      hlNotionalUsd: 1474.85,
      fundingHourly: 0.000055,
      capitalUsd: 2927.33,
    });
    expect(apr).toBeCloseTo(24.27, 1);
  });

  it("returns 0 when capital is 0", () => {
    expect(calcAprPct({ hlNotionalUsd: 100, fundingHourly: 0.0001, capitalUsd: 0 })).toBe(0);
  });

  it("returns negative APR when funding is negative", () => {
    const apr = calcAprPct({ hlNotionalUsd: 1000, fundingHourly: -0.0001, capitalUsd: 2000 });
    expect(apr).toBeLessThan(0);
  });
});

import { calcDeltaMismatchPct, isDeltaNeutral } from "@/lib/arb";

describe("arb.calcDeltaMismatchPct", () => {
  it("returns near zero for balanced pair", () => {
    // HL notional: 1 × $1474 = $1474
    // KR notional now: 1 × ₩2,180,000 / 1494 = $1459
    // mismatch: (1474 - 1459) / 1459 = 1.03%
    const d = calcDeltaMismatchPct({
      hlSizeAbs: 1,
      hlMarkUsd: 1474,
      krQuantity: 1,
      krCloseKrw: 2180000,
      usdKrwHana: 1494,
    });
    expect(Math.abs(d)).toBeLessThan(3);
  });

  it("returns > 3 for imbalanced pair", () => {
    // 2 HL shorts, only 1 KR share
    const d = calcDeltaMismatchPct({
      hlSizeAbs: 2,
      hlMarkUsd: 1474,
      krQuantity: 1,
      krCloseKrw: 2180000,
      usdKrwHana: 1494,
    });
    expect(Math.abs(d)).toBeGreaterThan(50);
  });
});

describe("arb.isDeltaNeutral", () => {
  it("true when |mismatch| < 3", () => {
    expect(isDeltaNeutral(1.5)).toBe(true);
    expect(isDeltaNeutral(-2.9)).toBe(true);
  });
  it("false when |mismatch| >= 3", () => {
    expect(isDeltaNeutral(3.0)).toBe(false);
    expect(isDeltaNeutral(-5)).toBe(false);
  });
});
