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

import { selectLiveKrPrice, isLiveKrFromNxt } from "@/lib/arb";

describe("arb.selectLiveKrPrice", () => {
  const base = { prevClose: 2000000, nxtSession: null as null | "PRE" | "AFTER_MARKET" };
  it("returns close when market is open", () => {
    expect(selectLiveKrPrice({ ...base, close: 2100000, nxtPrice: 2150000, marketOpen: true, nxtSession: null })).toBe(2100000);
  });
  it("returns nxtPrice when market is closed and NXT available", () => {
    expect(selectLiveKrPrice({ ...base, close: 2100000, nxtPrice: 2150000, marketOpen: false, nxtSession: "AFTER_MARKET" })).toBe(2150000);
  });
  it("falls back to close when market is closed and no NXT price", () => {
    expect(selectLiveKrPrice({ ...base, close: 2100000, nxtPrice: null, marketOpen: false, nxtSession: null })).toBe(2100000);
  });
});

describe("arb.isLiveKrFromNxt", () => {
  const base = { close: 2100000, prevClose: 2000000 };
  it("true when market closed and NXT price present", () => {
    expect(isLiveKrFromNxt({ ...base, nxtPrice: 2150000, marketOpen: false, nxtSession: "AFTER_MARKET" })).toBe(true);
  });
  it("false when market open", () => {
    expect(isLiveKrFromNxt({ ...base, nxtPrice: 2150000, marketOpen: true, nxtSession: null })).toBe(false);
  });
});

import { calcRealizedAprPct, calcTotalReturnPct, aggregateFundingByPeriod, calcRecentAprPct, isAprReliable } from "@/lib/arb";

describe("arb.calcRecentAprPct", () => {
  const NOW = new Date(2026, 6, 12, 12, 0).getTime();
  const h = (n: number) => NOW - n * 3600000;
  it("annualizes only funding within the trailing window", () => {
    // $24 across the last 24h, capital $1000, opened long ago
    const events = [
      { time: h(30), usdc: 100 }, // outside 24h window → excluded
      { time: h(20), usdc: 12 },
      { time: h(2), usdc: 12 },
    ];
    const apr = calcRecentAprPct({ events, capitalUsd: 1000, windowHours: 24, nowMs: NOW, openedAtMs: h(200) });
    // perHour = 24/24 = 1 → perYear 8760 → 876%
    expect(apr).toBeCloseTo(876, 0);
  });
  it("uses elapsed-since-open when younger than the window (no dilution)", () => {
    // opened 6h ago, $6 funding → perHour 1 → 876%, NOT divided by full 24h
    const events = [{ time: h(3), usdc: 6 }];
    const apr = calcRecentAprPct({ events, capitalUsd: 1000, windowHours: 24, nowMs: NOW, openedAtMs: h(6) });
    expect(apr).toBeCloseTo(876, 0);
  });
  it("returns 0 for zero capital or no elapsed time", () => {
    expect(calcRecentAprPct({ events: [{ time: h(1), usdc: 5 }], capitalUsd: 0, windowHours: 24, nowMs: NOW, openedAtMs: h(6) })).toBe(0);
    expect(calcRecentAprPct({ events: [], capitalUsd: 1000, windowHours: 24, nowMs: NOW, openedAtMs: NOW })).toBe(0);
  });
});

import { calcKimchiPct, decomposePremium } from "@/lib/arb";

describe("arb.calcKimchiPct", () => {
  it("is the USDT/KRW premium over the official USD/KRW rate", () => {
    // Upbit 1492 vs Hana 1503.4 → (1492-1503.4)/1503.4 = -0.758%
    expect(calcKimchiPct(1492, 1503.4)).toBeCloseTo(-0.758, 2);
  });
  it("is positive when USDT trades above the official rate", () => {
    expect(calcKimchiPct(1520, 1500)).toBeCloseTo(1.333, 2);
  });
  it("returns 0 when the official rate is 0", () => {
    expect(calcKimchiPct(1500, 0)).toBe(0);
  });
});

describe("arb.decomposePremium", () => {
  it("splits app premium into stock basis + USDT kimchi (stockBasis = app - kimchi)", () => {
    const d = decomposePremium({ hlMarkUsd: 1478.2, usdtKrw: 1492, usdKrw: 1503.4, krPriceKrw: 2186000 });
    // app premium via calcPremiumPct, kimchi via calcKimchiPct, basis = app - kimchi
    expect(d.stockBasis).toBeCloseTo(d.appPremium - d.kimchi, 6);
    expect(d.kimchi).toBeCloseTo(-0.758, 2);
  });
});

describe("arb.isAprReliable", () => {
  it("false while the sample is too short to annualize", () => {
    expect(isAprReliable(1, 1)).toBe(false);
    expect(isAprReliable(23, 5)).toBe(false);
    expect(isAprReliable(48, 2)).toBe(false);
  });
  it("true once there is enough elapsed time and settlements", () => {
    expect(isAprReliable(24, 3)).toBe(true);
    expect(isAprReliable(100, 20)).toBe(true);
  });
});

describe("arb.calcRealizedAprPct", () => {
  it("annualizes actual funding by elapsed hours over capital", () => {
    // $127.4 over 76 hours on $3150 capital
    // perHour = 127.4/76 = 1.676
    // perYear = 1.676 * 8760 = 14684.4
    // APR = 14684.4/3150 * 100 = 466.2%
    const apr = calcRealizedAprPct({ totalFundingUsd: 127.4, capitalUsd: 3150, elapsedHours: 76 });
    expect(apr).toBeCloseTo(466.2, 0);
  });
  it("returns 0 when elapsed is 0", () => {
    expect(calcRealizedAprPct({ totalFundingUsd: 10, capitalUsd: 100, elapsedHours: 0 })).toBe(0);
  });
  it("returns 0 when capital is 0", () => {
    expect(calcRealizedAprPct({ totalFundingUsd: 10, capitalUsd: 0, elapsedHours: 10 })).toBe(0);
  });
  it("handles negative funding", () => {
    expect(calcRealizedAprPct({ totalFundingUsd: -50, capitalUsd: 1000, elapsedHours: 100 })).toBeLessThan(0);
  });
});

describe("arb.calcTotalReturnPct", () => {
  it("returns funding/capital × 100", () => {
    expect(calcTotalReturnPct(50, 1000)).toBeCloseTo(5, 5);
  });
  it("returns 0 for zero capital", () => {
    expect(calcTotalReturnPct(50, 0)).toBe(0);
  });
  it("returns negative for negative funding", () => {
    expect(calcTotalReturnPct(-25, 500)).toBeCloseTo(-5, 5);
  });
});

describe("arb.aggregateFundingByPeriod", () => {
  const events = [
    { time: new Date(2026, 6, 12, 10, 30).getTime(), usdc: 5 },  // 2026-07-12 10:xx
    { time: new Date(2026, 6, 12, 10, 45).getTime(), usdc: 3 },  // same hour
    { time: new Date(2026, 6, 12, 11, 5).getTime(), usdc: 4 },   // next hour
    { time: new Date(2026, 6, 13, 9, 0).getTime(), usdc: 2 },    // next day
  ];
  it("buckets by hour", () => {
    const buckets = aggregateFundingByPeriod(events, "hour");
    expect(buckets).toHaveLength(3);
    expect(buckets[0].usdc).toBe(8);
    expect(buckets[0].count).toBe(2);
  });
  it("buckets by day", () => {
    const buckets = aggregateFundingByPeriod(events, "day");
    expect(buckets).toHaveLength(2);
    expect(buckets[0].usdc).toBe(12);
    expect(buckets[1].usdc).toBe(2);
  });
  it("buckets by month", () => {
    const buckets = aggregateFundingByPeriod(events, "month");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].usdc).toBe(14);
    expect(buckets[0].count).toBe(4);
  });
  it("returns empty array for empty input", () => {
    expect(aggregateFundingByPeriod([], "day")).toEqual([]);
  });
  it("labels buckets with the LOCAL calendar date/hour, not UTC", () => {
    // Event at local 2026-07-12 10:30. For any non-UTC machine (e.g. KST),
    // the label must still read the local date, not a UTC-shifted one.
    const local = [{ time: new Date(2026, 6, 12, 10, 30).getTime(), usdc: 5 }];
    expect(aggregateFundingByPeriod(local, "hour")[0].key).toBe("2026-07-12 10");
    expect(aggregateFundingByPeriod(local, "day")[0].key).toBe("2026-07-12");
    expect(aggregateFundingByPeriod(local, "month")[0].key).toBe("2026-07");
  });
  it("sorts buckets chronologically", () => {
    const outOfOrder = [
      { time: new Date(2026, 8, 1).getTime(), usdc: 1 },
      { time: new Date(2026, 6, 1).getTime(), usdc: 2 },
      { time: new Date(2026, 7, 1).getTime(), usdc: 3 },
    ];
    const buckets = aggregateFundingByPeriod(outOfOrder, "month");
    expect(buckets[0].ts).toBeLessThan(buckets[1].ts);
    expect(buckets[1].ts).toBeLessThan(buckets[2].ts);
  });
});
