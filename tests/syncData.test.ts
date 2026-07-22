import { describe, it, expect } from "vitest";
import {
  isSyncKey,
  mergeStoreValue,
  summarizePayload,
  encodeSyncPayload,
  decodeSyncPayload,
  type SyncPayload,
} from "@/lib/syncData";

describe("isSyncKey", () => {
  it("hypurr_/hlbot_ 접두사만 대상", () => {
    expect(isSyncKey("hypurr_arb_spot_trades")).toBe(true);
    expect(isSyncKey("hlbot_addresses")).toBe(true);
    expect(isSyncKey("hypurr_portfolio_items::p2")).toBe(true);
    expect(isSyncKey("theme")).toBe(false);
  });
  it("파생 캐시(premium_history)는 제외", () => {
    expect(isSyncKey("hlbot_premium_history")).toBe(false);
  });
});

describe("mergeStoreValue", () => {
  it("기존 값이 없으면 가져온 값 그대로", () => {
    expect(mergeStoreValue(null, '[{"id":"a"}]')).toBe('[{"id":"a"}]');
  });

  it("id 배열은 union — 가져온 쪽 우선, 로컬 전용 항목 보존", () => {
    const existing = JSON.stringify([
      { id: "a", memo: "old" },
      { id: "local-only", memo: "keep" },
    ]);
    const incoming = JSON.stringify([{ id: "a", memo: "new" }]);
    const merged = JSON.parse(mergeStoreValue(existing, incoming));
    expect(merged).toEqual([
      { id: "a", memo: "new" },
      { id: "local-only", memo: "keep" },
    ]);
  });

  it("address 키(주소록)도 union — 대소문자 무시", () => {
    const existing = JSON.stringify([{ address: "0xABC", label: "L" }]);
    const incoming = JSON.stringify([{ address: "0xabc", label: "New" }]);
    const merged = JSON.parse(mergeStoreValue(existing, incoming));
    expect(merged).toEqual([{ address: "0xabc", label: "New" }]);
  });

  it("배열이 아니면(스칼라 설정 등) 가져온 값으로 교체", () => {
    expect(mergeStoreValue('"full"', '"hl"')).toBe('"hl"');
  });

  it("JSON이 아닌 값도 교체", () => {
    expect(mergeStoreValue("plain", "next")).toBe("next");
  });
});

describe("encode/decode 왕복", () => {
  it("gzip 코드 왕복 후 데이터 동일", async () => {
    const payload: SyncPayload = {
      v: 1,
      exportedAt: 1753200000000,
      data: {
        hypurr_arb_spot_trades: JSON.stringify([{ id: "t1", side: "buy" }]),
        hlbot_apr_basis: '"full"',
      },
    };
    const code = await encodeSyncPayload(payload);
    const back = await decodeSyncPayload(code);
    expect(back).toEqual(payload);
  });

  it("URL에 든 코드도 해석", async () => {
    const payload: SyncPayload = { v: 1, exportedAt: 1, data: {} };
    const code = await encodeSyncPayload(payload);
    const back = await decodeSyncPayload(`https://example.com/sync#d=${code}`);
    expect(back).toEqual(payload);
  });

  it("엉뚱한 문자열은 throw", async () => {
    await expect(decodeSyncPayload("hello world")).rejects.toThrow();
  });
});

describe("summarizePayload", () => {
  it("배열 스토어는 개수, 그 외는 null", () => {
    const payload: SyncPayload = {
      v: 1,
      exportedAt: 1,
      data: {
        hypurr_arb_pairs: "[1,2,3]",
        hlbot_apr_basis: '"full"',
      },
    };
    expect(summarizePayload(payload)).toEqual([
      { key: "hlbot_apr_basis", count: null },
      { key: "hypurr_arb_pairs", count: 3 },
    ]);
  });
});
