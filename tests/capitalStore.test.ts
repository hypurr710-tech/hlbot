import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadCapitalEvents,
  addCapitalEvent,
  removeCapitalEvent,
  netFlowUsd,
  capitalAdjustmentUsd,
  type CapitalEvent,
} from "@/lib/capitalStore";

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

describe("capitalStore", () => {
  beforeEach(() => localStorageMock.clear());

  it("adds and loads events", () => {
    const e = addCapitalEvent({ ts: 1000, venue: "hl", amountUsd: 5000, memo: "첫 입금" });
    expect(e.id).toBeTruthy();
    const all = loadCapitalEvents();
    expect(all).toHaveLength(1);
    expect(all[0].amountUsd).toBe(5000);
  });

  it("removes by id", () => {
    const e = addCapitalEvent({ ts: 1000, venue: "kr", amountUsd: 3000 });
    removeCapitalEvent(e.id);
    expect(loadCapitalEvents()).toHaveLength(0);
  });

  it("netFlowUsd sums all venues, capitalAdjustmentUsd only 'other'", () => {
    const events: CapitalEvent[] = [
      { id: "a", ts: 1, venue: "hl", amountUsd: 5000 },
      { id: "b", ts: 2, venue: "kr", amountUsd: 3000 },
      { id: "c", ts: 3, venue: "other", amountUsd: 1000 },
      { id: "d", ts: 4, venue: "other", amountUsd: -400 },
    ];
    expect(netFlowUsd(events)).toBe(8600);
    expect(capitalAdjustmentUsd(events)).toBe(600);
  });

  it("survives corrupt JSON", () => {
    localStorageMock.setItem("hypurr_arb_capital_events", "{not json");
    expect(loadCapitalEvents()).toEqual([]);
  });
});
