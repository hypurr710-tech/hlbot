import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchUpbitUsdtKrw } from "@/lib/aggregator/upbitFx";

const okResponse = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("upbitFx", () => {
  it("parses USDT/KRW from Upbit ticker", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      okResponse([{ market: "KRW-USDT", trade_price: 1503.4 }])
    ));
    const rate = await fetchUpbitUsdtKrw();
    expect(rate).toBe(1503.4);
  });

  it("returns null on empty response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse([])));
    expect(await fetchUpbitUsdtKrw()).toBeNull();
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 500 })));
    expect(await fetchUpbitUsdtKrw()).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await fetchUpbitUsdtKrw()).toBeNull();
  });
});
