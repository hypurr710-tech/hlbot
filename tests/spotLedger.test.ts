import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadSpotTrades,
  addSpotTrade,
  removeSpotTrade,
  computeSpotPositions,
  type SpotTrade,
} from "@/lib/spotLedger";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("window", {});

function trade(over: Partial<SpotTrade>): SpotTrade {
  return {
    id: "t",
    ts: 1,
    hlSymbol: "xyz:SKHX",
    krCode: "000660",
    krName: "SK하이닉스",
    side: "buy",
    quantity: 10,
    priceKrw: 2_000_000,
    ...over,
  };
}

describe("spotLedger store", () => {
  beforeEach(() => localStorageMock.clear());

  it("adds, loads, removes trades", () => {
    const t = addSpotTrade({ ts: 1, hlSymbol: "xyz:SKHX", krCode: "000660", krName: "SK하이닉스", side: "buy", quantity: 5, priceKrw: 1_900_000 });
    expect(loadSpotTrades()).toHaveLength(1);
    removeSpotTrade(t.id);
    expect(loadSpotTrades()).toHaveLength(0);
  });

  it("survives corrupt JSON", () => {
    localStorageMock.setItem("hypurr_arb_spot_trades", "{broken");
    expect(loadSpotTrades()).toEqual([]);
  });
});

describe("spotLedger.computeSpotPositions", () => {
  it("매수는 이동평균으로 평단을 갱신한다", () => {
    const pos = computeSpotPositions([
      trade({ id: "a", ts: 1, quantity: 10, priceKrw: 2_000_000 }),
      trade({ id: "b", ts: 2, quantity: 10, priceKrw: 2_200_000 }),
    ]);
    expect(pos).toHaveLength(1);
    expect(pos[0].quantity).toBe(20);
    expect(pos[0].avgPriceKrw).toBe(2_100_000);
    expect(pos[0].investedKrw).toBe(42_000_000);
  });

  it("매도는 평단을 유지하고 실현손익을 쌓는다", () => {
    const pos = computeSpotPositions([
      trade({ id: "a", ts: 1, quantity: 10, priceKrw: 2_000_000 }),
      trade({ id: "b", ts: 2, side: "sell", quantity: 4, priceKrw: 2_500_000 }),
    ]);
    expect(pos[0].quantity).toBe(6);
    expect(pos[0].avgPriceKrw).toBe(2_000_000);
    expect(pos[0].realizedKrw).toBe(4 * 500_000);
  });

  it("보유량 초과 매도는 보유분까지만 반영한다", () => {
    const pos = computeSpotPositions([
      trade({ id: "a", ts: 1, quantity: 3, priceKrw: 1_000_000 }),
      trade({ id: "b", ts: 2, side: "sell", quantity: 10, priceKrw: 1_100_000 }),
    ]);
    expect(pos[0].quantity).toBe(0);
    expect(pos[0].realizedKrw).toBe(3 * 100_000);
    expect(pos[0].avgPriceKrw).toBe(0);
  });

  it("종목별로 분리 집계하고 ts 순서로 재생한다", () => {
    const pos = computeSpotPositions([
      trade({ id: "b", ts: 2, quantity: 5, priceKrw: 2_200_000 }),
      trade({ id: "a", ts: 1, quantity: 5, priceKrw: 2_000_000 }),
      trade({ id: "c", ts: 3, krCode: "005930", krName: "삼성전자", hlSymbol: "xyz:SSNL", quantity: 100, priceKrw: 80_000 }),
    ]);
    expect(pos).toHaveLength(2);
    const hynix = pos.find((p) => p.krCode === "000660")!;
    expect(hynix.avgPriceKrw).toBe(2_100_000);
  });
});
