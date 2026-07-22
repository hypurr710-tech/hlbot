import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  loadPortfolioItems,
  addPortfolioItem,
  removePortfolioItem,
  computePortfolio,
  type PortfolioItem,
} from "@/lib/portfolio";

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

function item(over: Partial<PortfolioItem>): PortfolioItem {
  return {
    id: "x", name: "테스트", type: "interest", currency: "KRW",
    principal: 100_000_000, aprPct: 3.5, createdAt: 1, ...over,
  };
}

describe("portfolio store", () => {
  beforeEach(() => localStorageMock.clear());

  it("adds/loads/removes", () => {
    const i = addPortfolioItem({ name: "예금", type: "interest", currency: "KRW", principal: 1000, aprPct: 3 });
    expect(loadPortfolioItems()).toHaveLength(1);
    removePortfolioItem(i.id);
    expect(loadPortfolioItems()).toHaveLength(0);
  });

  it("survives corrupt JSON", () => {
    localStorageMock.setItem("hypurr_portfolio_items", "{nope");
    expect(loadPortfolioItems()).toEqual([]);
  });
});

describe("portfolio.computePortfolio", () => {
  const ctx = { usdKrw: 1500, funding: { capitalUsd: 100_000, aprPct: 40 } };

  it("이자형: 연=원금×이율, 월=연/12", () => {
    const { rows } = computePortfolio([item({ principal: 120_000_000, aprPct: 5 })], ctx);
    expect(rows[0].yearlyKrw).toBe(6_000_000);
    expect(rows[0].monthlyKrw).toBe(500_000);
  });

  it("USD 항목은 환율로 환산, 환율 없으면 null", () => {
    const usdItem = item({ currency: "USD", principal: 10_000, aprPct: 10 });
    const { rows } = computePortfolio([usdItem], ctx);
    expect(rows[0].principalKrw).toBe(15_000_000);
    expect(rows[0].yearlyKrw).toBe(1_500_000);
    const noFx = computePortfolio([usdItem], { usdKrw: null, funding: null });
    expect(noFx.rows[0].principalKrw).toBeNull();
  });

  it("고정수입형: 원금 없으면 현금흐름엔 포함, APR엔 제외", () => {
    const { rows, totals } = computePortfolio(
      [
        item({ id: "a", principal: 100_000_000, aprPct: 6 }),               // 연 600만
        item({ id: "b", type: "income", monthlyAmount: 3_000_000, principal: undefined, aprPct: undefined }), // 월 300만 근로소득
      ],
      ctx
    );
    expect(rows[1].aprPct).toBeNull();
    expect(totals.monthlyKrw).toBe(500_000 + 3_000_000);
    expect(totals.principalKrw).toBe(100_000_000);
    expect(totals.weightedAprPct).toBeCloseTo(6, 5); // 근로소득이 APR을 왜곡하지 않음
  });

  it("펀딩파밍: 라이브 자본×라이브 APR, 오버라이드 우선", () => {
    const live = computePortfolio([item({ type: "funding", principal: undefined, aprPct: undefined })], ctx);
    expect(live.rows[0].principalKrw).toBe(150_000_000);
    expect(live.rows[0].aprPct).toBe(40);
    expect(live.rows[0].auto).toBe(true);
    expect(live.rows[0].yearlyKrw).toBe(60_000_000);

    const override = computePortfolio([item({ type: "funding", principal: undefined, aprPct: 25 })], ctx);
    expect(override.rows[0].aprPct).toBe(25);
    expect(override.rows[0].auto).toBe(false);

    const noLive = computePortfolio([item({ type: "funding", principal: undefined, aprPct: undefined })], { usdKrw: 1500, funding: null });
    expect(noLive.rows[0].yearlyKrw).toBeNull();
  });

  it("가중평균 APR = 원금 항목들의 연수익 합 ÷ 원금 합", () => {
    const { totals } = computePortfolio(
      [
        item({ id: "a", principal: 100_000_000, aprPct: 4 }),  // 400만
        item({ id: "b", principal: 300_000_000, aprPct: 8 }),  // 2400만
      ],
      ctx
    );
    expect(totals.weightedAprPct).toBeCloseTo((4_000_000 + 24_000_000) / 400_000_000 * 100, 5); // 7%
  });
});

import {
  loadProfiles,
  addProfile,
  removeProfile,
  getActiveProfileId,
  setActiveProfileId,
  DEFAULT_PROFILE_ID,
} from "@/lib/portfolio";

describe("portfolio profiles", () => {
  beforeEach(() => localStorageMock.clear());

  it("기본 프로필이 항상 존재한다", () => {
    const profiles = loadProfiles();
    expect(profiles).toHaveLength(1);
    expect(getActiveProfileId()).toBe(profiles[0].id);
  });

  it("프로필별로 항목이 분리 저장된다", () => {
    const dad = addProfile("아빠꺼");
    addPortfolioItem({ name: "내 예금", type: "interest", currency: "KRW", principal: 1000, aprPct: 3 });
    addPortfolioItem({ name: "아빠 예금", type: "interest", currency: "KRW", principal: 2000, aprPct: 4 }, dad.id);
    expect(loadPortfolioItems()).toHaveLength(1);
    expect(loadPortfolioItems(dad.id)).toHaveLength(1);
    expect(loadPortfolioItems(dad.id)[0].name).toBe("아빠 예금");
  });

  it("프로필 삭제 시 항목도 삭제되고 활성 프로필이 이동한다", () => {
    // 기본 프로필을 profiles 목록에 명시적으로 만든 뒤 진행
    const mine = addProfile("내꺼");
    const dad = addProfile("아빠꺼");
    addPortfolioItem({ name: "아빠 예금", type: "interest", currency: "KRW", principal: 2000, aprPct: 4 }, dad.id);
    setActiveProfileId(dad.id);
    removeProfile(dad.id);
    expect(loadPortfolioItems(dad.id)).toHaveLength(0);
    expect(getActiveProfileId()).not.toBe(dad.id);
    expect(loadProfiles().some((p) => p.id === mine.id)).toBe(true);
  });

  it("마지막 프로필은 삭제되지 않는다", () => {
    const only = addProfile("유일");
    removeProfile(only.id);
    expect(loadProfiles().length).toBeGreaterThanOrEqual(1);
  });

  it("legacy 키가 default 프로필 데이터로 그대로 보인다", () => {
    localStorageMock.setItem(
      "hypurr_portfolio_items",
      JSON.stringify([{ id: "old", name: "옛날 예금", type: "interest", currency: "KRW", principal: 1, aprPct: 1, createdAt: 1 }])
    );
    expect(loadPortfolioItems(DEFAULT_PROFILE_ID)[0].name).toBe("옛날 예금");
  });
});
