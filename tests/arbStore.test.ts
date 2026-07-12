import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadArbPairs,
  addArbPair,
  updateArbPair,
  removeArbPair,
  closeArbPair,
  type ArbPair,
} from "@/lib/arbStore";

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

const sample: Omit<ArbPair, "id" | "createdAt"> = {
  hlAddress: "0xabc",
  hlSymbol: "xyz:SKHX",
  krLeg: { krCode: "000660", krName: "SK하이닉스", quantity: 1, avgPriceKrw: 2170000, entryTs: 1234 },
};

describe("arbStore", () => {
  it("starts empty", () => {
    expect(loadArbPairs()).toEqual([]);
  });

  it("addArbPair assigns id + createdAt", () => {
    const p = addArbPair(sample);
    expect(p.id).toBeTruthy();
    expect(p.createdAt).toBeGreaterThan(0);
    expect(loadArbPairs()).toHaveLength(1);
  });

  it("updateArbPair replaces by id", () => {
    const p = addArbPair(sample);
    updateArbPair(p.id, { note: "test" });
    expect(loadArbPairs()[0].note).toBe("test");
  });

  it("removeArbPair deletes by id", () => {
    const p = addArbPair(sample);
    removeArbPair(p.id);
    expect(loadArbPairs()).toEqual([]);
  });

  it("closeArbPair sets closedAt but keeps entry", () => {
    const p = addArbPair(sample);
    closeArbPair(p.id);
    const loaded = loadArbPairs()[0];
    expect(loaded.closedAt).toBeGreaterThan(0);
  });
});
