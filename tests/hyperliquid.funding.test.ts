import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getUserFundingAll, type FundingEvent } from "@/lib/hyperliquid";

function makeEvent(time: number, i: number): FundingEvent {
  return {
    time,
    delta: { coin: "xyz:SKHX", fundingRate: "0.0001", szi: "-10", type: "funding", usdc: "1" },
    hash: `h${time}-${i}`,
  };
}

describe("hyperliquid.getUserFundingAll", () => {
  const calls: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    calls.length = 0;
    // 1페이지: 500건(시각 1000~1499) → 2페이지: 3건(1500~1502)
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      calls.push(body);
      const start = body.startTime as number;
      const events =
        start <= 1499
          ? Array.from({ length: 500 }, (_, i) => makeEvent(1000 + i, i))
          : Array.from({ length: 3 }, (_, i) => makeEvent(1500 + i, i));
      return new Response(JSON.stringify(events), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("500건이 꽉 찬 페이지 뒤로 커서를 옮겨 이어받는다", async () => {
    const events = await getUserFundingAll("0xabc", 0, "xyz");
    expect(events).toHaveLength(503);
    expect(calls).toHaveLength(2);
    expect(calls[0].startTime).toBe(0);
    expect(calls[1].startTime).toBe(1500); // 마지막 time 1499 + 1
    // 오름차순 보장
    expect(events[0].time).toBe(1000);
    expect(events[events.length - 1].time).toBe(1502);
  }, 15000);
});
