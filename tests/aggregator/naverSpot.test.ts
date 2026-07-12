import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchNaverSpot } from "@/lib/aggregator/naverSpot";

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const jsonResp = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });

// Live NAVER mobile stock JSON (verified 2026-07-10 for SK하이닉스 000660):
//   closePrice:                    "2,180,000"   (regular session close, comma-formatted string)
//   compareToPreviousClosePrice:   "-6,000"      (change vs prev close)
//   marketStatus:                  "OPEN" | "CLOSE"
//   overMarketPriceInfo: {
//     tradingSessionType:          "PRE" | "AFTER_MARKET"
//     overMarketStatus:            "OPEN" | "CLOSE"
//     overPrice:                   "2,201,000"   (after-hours / NXT-equivalent price)
//   }
//
// Note: NAVER does not use "NXT" branding; overMarketPriceInfo is the after-hours session
// which serves the same arb purpose (best available KR price when regular session is closed).

describe("naverSpot", () => {
  it("parses close and prevClose from mobile JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp({
      closePrice: "2,180,000",
      compareToPreviousClosePrice: "-6,000",
      marketStatus: "CLOSE",
    })));
    const q = await fetchNaverSpot("000660");
    expect(q?.close).toBe(2180000);
    expect(q?.prevClose).toBe(2186000);
    expect(q?.nxtPrice).toBeNull();
    expect(q?.nxtSession).toBeNull();
  });

  it("parses after-market (NXT-equivalent) price from overMarketPriceInfo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp({
      closePrice: "2,180,000",
      compareToPreviousClosePrice: "-6,000",
      marketStatus: "CLOSE",
      overMarketPriceInfo: {
        tradingSessionType: "AFTER_MARKET",
        overMarketStatus: "OPEN",
        overPrice: "2,201,000",
      },
    })));
    const q = await fetchNaverSpot("000660");
    expect(q?.close).toBe(2180000);
    expect(q?.nxtPrice).toBe(2201000);
    expect(q?.nxtSession).toBe("AFTER_MARKET");
  });

  it("parses PRE session type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp({
      closePrice: "100,000",
      compareToPreviousClosePrice: "500",
      overMarketPriceInfo: {
        tradingSessionType: "PRE",
        overMarketStatus: "OPEN",
        overPrice: "100,500",
      },
    })));
    const q = await fetchNaverSpot("000660");
    expect(q?.nxtSession).toBe("PRE");
    expect(q?.nxtPrice).toBe(100500);
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await fetchNaverSpot("000660")).toBeNull();
  });

  it("returns null on missing fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp({})));
    expect(await fetchNaverSpot("000660")).toBeNull();
  });

  it("returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await fetchNaverSpot("000660")).toBeNull();
  });

  it("handles positive change (rising)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp({
      closePrice: "50,000",
      compareToPreviousClosePrice: "1,500",
    })));
    const q = await fetchNaverSpot("005930");
    expect(q?.close).toBe(50000);
    expect(q?.prevClose).toBe(48500);
  });

  it("ignores invalid overMarketPriceInfo (missing overPrice)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp({
      closePrice: "100,000",
      compareToPreviousClosePrice: "500",
      overMarketPriceInfo: {
        tradingSessionType: "AFTER_MARKET",
      },
    })));
    const q = await fetchNaverSpot("000660");
    expect(q?.nxtPrice).toBeNull();
    expect(q?.nxtSession).toBe("AFTER_MARKET");
  });
});
