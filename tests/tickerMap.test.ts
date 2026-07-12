import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadTickerMap,
  addTickerOverride,
  removeTickerOverride,
  getTickerByHl,
} from "@/lib/tickerMap";

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
vi.stubGlobal("window", { localStorage: localStorageMock });

beforeEach(() => localStorageMock.clear());

describe("tickerMap", () => {
  it("returns seed entries", () => {
    const map = loadTickerMap();
    expect(map.some((t) => t.hlSymbol === "xyz:SKHX")).toBe(true);
    expect(map.some((t) => t.hlSymbol === "xyz:SMSN")).toBe(true);
  });

  it("merges user overrides on top of seed", () => {
    addTickerOverride({
      hlSymbol: "xyz:NAVR",
      krCode: "035420",
      krName: "네이버",
      market: "KOSPI",
    });
    const map = loadTickerMap();
    expect(map.find((t) => t.hlSymbol === "xyz:NAVR")?.krCode).toBe("035420");
  });

  it("getTickerByHl returns undefined for unknown", () => {
    expect(getTickerByHl("xyz:UNKNOWN")).toBeUndefined();
  });

  it("removeTickerOverride removes user entry only", () => {
    addTickerOverride({ hlSymbol: "xyz:NAVR", krCode: "035420", krName: "네이버", market: "KOSPI" });
    removeTickerOverride("xyz:NAVR");
    expect(getTickerByHl("xyz:NAVR")).toBeUndefined();
    // seed entries still there
    expect(getTickerByHl("xyz:SKHX")).toBeDefined();
  });
});
