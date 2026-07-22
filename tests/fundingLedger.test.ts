import { describe, it, expect } from "vitest";
import { collectPairEvents, calcLedgerStats, type LedgerEvent } from "@/lib/fundingLedger";
import type { ArbPair } from "@/lib/arbStore";
import type { FundingEvent } from "@/lib/hyperliquid";

const H = 3600000;
const T0 = new Date(2026, 6, 1).getTime();

function pair(over: Partial<ArbPair>): ArbPair {
  return {
    id: "p1",
    hlAddress: "0xAbC",
    hlSymbol: "xyz:SKHX",
    krLeg: { krCode: "000660", krName: "SK하이닉스", quantity: 10, avgPriceKrw: 2_000_000, entryTs: T0 },
    createdAt: T0,
    openedAt: T0,
    ...over,
  };
}

function fev(time: number, usdc: string, coin = "xyz:SKHX"): FundingEvent {
  return { time, delta: { coin, fundingRate: "0.0001", szi: "-10", type: "funding", usdc }, hash: `h${time}` };
}

describe("fundingLedger.collectPairEvents", () => {
  it("openedAt~closedAt 구간·심볼로 필터하고 프리픽스를 벗긴다", () => {
    const p = pair({ closedAt: T0 + 10 * H });
    const funding = {
      "0xabc": [
        fev(T0 - H, "9"),            // 오픈 전 — 제외
        fev(T0 + H, "1"),            // 포함
        fev(T0 + 2 * H, "2", "SKHX"), // 프리픽스 없는 표기도 포함
        fev(T0 + 3 * H, "5", "xyz:OTHER"), // 다른 심볼 — 제외
        fev(T0 + 11 * H, "9"),       // 청산 후 — 제외
      ],
    };
    const events = collectPairEvents([p], funding, T0 + 20 * H);
    expect(events).toHaveLength(2);
    expect(events[0].coin).toBe("SKHX");
    expect(events.reduce((s, e) => s + e.usdc, 0)).toBe(3);
  });

  it("같은 지갑·심볼에 겹치는 페어가 있어도 이벤트를 이중계상하지 않는다", () => {
    const p1 = pair({ id: "p1" });
    const p2 = pair({ id: "p2" }); // 동일 지갑·심볼·기간
    const funding = { "0xabc": [fev(T0 + H, "1")] };
    const events = collectPairEvents([p1, p2], funding, T0 + 2 * H);
    expect(events).toHaveLength(1);
  });
});

describe("fundingLedger.calcLedgerStats", () => {
  const evs: LedgerEvent[] = [
    { time: T0 + H, coin: "SKHX", usdc: 1, rate: 0.0001, nSamples: 1, pairId: "p1" },
    { time: T0 + 2 * H, coin: "SKHX", usdc: 2, rate: 0.0001, nSamples: 24, pairId: "p1" },
    { time: T0 + 3 * H, coin: "SKHX", usdc: 3, rate: 0.0001, nSamples: 1, pairId: "p1" },
    { time: T0 + 3 * H + 60000, coin: "AAPL", usdc: 0.5, rate: 0.0001, nSamples: 1, pairId: "p2" },
  ];

  it("누적·정산횟수·직전 펀비를 계산한다", () => {
    const stats = calcLedgerStats(evs, [pair({})], T0 + 48 * H);
    expect(stats.totalUsdc).toBeCloseTo(6.5, 5);
    expect(stats.settlementCount).toBe(27); // 1+24+1+1
    expect(stats.firstOpenedAt).toBe(T0);
    expect(stats.elapsedDays).toBeCloseTo(2, 3);
    // 직전 펀비 = 가장 최근 시간 버킷(T0+3H)의 합 = 3 + 0.5
    expect(stats.lastHourUsdc).toBeCloseTo(3.5, 5);
  });

  it("이벤트가 없으면 null 필드로 응답", () => {
    const stats = calcLedgerStats([], [], T0);
    expect(stats.totalUsdc).toBe(0);
    expect(stats.lastHourUsdc).toBeNull();
    expect(stats.firstOpenedAt).toBeNull();
  });
});
