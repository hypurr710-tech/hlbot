# Arb Funding 수익 기록 페이지 (`/arb/history`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** changwoo.vercel.app 스타일의 펀딩 수익 기록 대시보드를 `/arb/history` 페이지로 추가한다 — 스탯 카드(누적 펀딩·APR·직전/다음 펀비·투입자본·현물원금·HL예치금·환율) + 월별/일별/시간별 기록 테이블 + 입출금 장부.

**Architecture:** 클라이언트 전용. 펀딩 이력은 HL `userFunding` API(페이지네이션 추가), HL 예치금은 `clearinghouseState`, 입출금 장부는 localStorage. 순수 계산 로직은 `src/lib/`에 두고 vitest로 테스트, 컴포넌트는 `src/app/arb/history/` 아래에 배치.

**Tech Stack:** Next.js 15 (App Router, client components), TypeScript, Tailwind (기존 `hl-*` 토큰), vitest.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-22-arb-funding-history-design.md`
- 디자인: app.hyperliquid.xyz 트레이드 UI 느낌 — 기존 `hl-*` 토큰(다크 + 틸 악센트 + `font-mono` 숫자)만 사용, 새 색상 토큰 추가 금지
- HL API 호출은 반드시 `src/lib/hyperliquid.ts`의 `postInfo` 경유 (rate limiter 준수)
- 모든 수익률은 gross — 페이지 푸터에 기존 `/arb` 푸터와 같은 고지 문구 유지
- 자본 분모: APR 기준 토글 `full` = 현재 투입 자본(HL예치금+현물원금USD+기타 조정), `hl` = HL 예치금만
- 입출금 장부에서 자본에 가산되는 건 `venue === "other"`(기타 대기자금)뿐 — HL/국내 입출금은 이력 기록용 (라이브 예치금/현물원금에 이미 반영되므로 이중계상 방지)
- 커밋 메시지 끝에 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 테스트 실행 명령: `npx vitest run <파일>` (watch 금지)

---

### Task 1: `formatKrwCompact` — 원화 억/만원 표기

**Files:**
- Modify: `src/lib/format.ts` (파일 끝에 추가)
- Test: `tests/format.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Produces: `formatKrwCompact(valueKrw: number): string` — `250000000 → "₩2.5억"`, `35000000 → "₩3,500만"`, `9000 → "₩9,000"`

- [ ] **Step 1: Write the failing test** — `tests/format.test.ts` 끝에 추가:

```ts
import { formatKrwCompact } from "@/lib/format";

describe("format.formatKrwCompact", () => {
  it("formats 억 scale", () => {
    expect(formatKrwCompact(250_000_000)).toBe("₩2.5억");
    expect(formatKrwCompact(1_000_000_000)).toBe("₩10억");
  });
  it("formats 만원 scale", () => {
    expect(formatKrwCompact(35_000_000)).toBe("₩3,500만");
    expect(formatKrwCompact(10_000)).toBe("₩1만");
  });
  it("formats sub-만원 as plain won", () => {
    expect(formatKrwCompact(9_000)).toBe("₩9,000");
    expect(formatKrwCompact(0)).toBe("₩0");
  });
  it("keeps sign for negatives", () => {
    expect(formatKrwCompact(-35_000_000)).toBe("-₩3,500만");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/format.test.ts`
Expected: FAIL — `formatKrwCompact` is not exported

- [ ] **Step 3: Write minimal implementation** — `src/lib/format.ts` 끝에 추가:

```ts
/** 원화를 억/만원 단위로 축약 표기. 예: 2.5억, 3,500만, 9,000원 미만은 그대로. */
export function formatKrwCompact(valueKrw: number): string {
  const sign = valueKrw < 0 ? "-" : "";
  const abs = Math.abs(valueKrw);
  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000;
    const s = eok >= 10 ? Math.round(eok).toLocaleString("en-US") : String(Math.round(eok * 10) / 10);
    return `${sign}₩${s}억`;
  }
  if (abs >= 10_000) {
    return `${sign}₩${Math.round(abs / 10_000).toLocaleString("en-US")}만`;
  }
  return `${sign}₩${Math.round(abs).toLocaleString("en-US")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/format.test.ts`
Expected: PASS (전체)

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts tests/format.test.ts
git commit -m "feat(format): formatKrwCompact 억/만원 표기 헬퍼"
```

---

### Task 2: `buildPeriodRows` — 구간별 수익률/연 APR 계산

**Files:**
- Modify: `src/lib/arb.ts` (파일 끝에 추가)
- Test: `tests/arb.test.ts` (기존 파일에 describe 추가)

**Interfaces:**
- Consumes: `FundingBucket`, `FundingPeriod`, `aggregateFundingByPeriod` (기존 arb.ts)
- Produces:

```ts
export interface PeriodRow extends FundingBucket {
  returnPct: number;    // 구간 펀딩피 / capitalUsd × 100
  aprPct: number;       // returnPct를 hoursCovered로 연환산 (×8760/hoursCovered)
  hoursCovered: number; // 완결 구간은 전체 시간, 진행 중 구간은 경과 시간
}
export function buildPeriodRows(
  buckets: FundingBucket[],
  period: FundingPeriod,
  capitalUsd: number,
  nowMs: number
): PeriodRow[]
```

- [ ] **Step 1: Write the failing test** — `tests/arb.test.ts` 끝에 추가:

```ts
import { buildPeriodRows, type FundingBucket } from "@/lib/arb";

describe("arb.buildPeriodRows", () => {
  // 2026-07-20 00:00 로컬 기준 완결된 하루
  const day20 = new Date(2026, 6, 20).getTime();
  const day21 = new Date(2026, 6, 21).getTime();
  const buckets: FundingBucket[] = [
    { key: "2026-07-20", ts: day20, usdc: 24, count: 24 },
    { key: "2026-07-21", ts: day21, usdc: 6, count: 6 },
  ];
  // "지금"은 7/21 06:00 → 7/21은 6시간만 경과한 진행 중 구간
  const now = new Date(2026, 6, 21, 6).getTime();
  const capital = 100_000;

  it("완결된 일 구간은 24h로 연환산", () => {
    const rows = buildPeriodRows(buckets, "day", capital, now);
    const r = rows.find((x) => x.key === "2026-07-20")!;
    expect(r.hoursCovered).toBe(24);
    expect(r.returnPct).toBeCloseTo(0.024, 5); // 24/100000×100
    // APR = 0.024% × (8760/24) = 8.76%
    expect(r.aprPct).toBeCloseTo(8.76, 2);
  });

  it("진행 중 일 구간은 경과 시간으로 연환산", () => {
    const rows = buildPeriodRows(buckets, "day", capital, now);
    const r = rows.find((x) => x.key === "2026-07-21")!;
    expect(r.hoursCovered).toBeCloseTo(6, 5);
    // 6/100000×100 = 0.006% → ×(8760/6) = 8.76%
    expect(r.aprPct).toBeCloseTo(8.76, 2);
  });

  it("월 구간은 해당 월의 일수를 반영", () => {
    const jun = new Date(2026, 5, 1).getTime(); // 6월 = 30일
    const rows = buildPeriodRows(
      [{ key: "2026-06", ts: jun, usdc: 720, count: 720 }],
      "month",
      capital,
      now
    );
    expect(rows[0].hoursCovered).toBe(720); // 30일 × 24h (완결)
    expect(rows[0].aprPct).toBeCloseTo((720 / capital) * 100 * (8760 / 720), 2);
  });

  it("capital이 0이면 수익률/APR 0", () => {
    const rows = buildPeriodRows(buckets, "day", 0, now);
    expect(rows[0].returnPct).toBe(0);
    expect(rows[0].aprPct).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/arb.test.ts`
Expected: FAIL — `buildPeriodRows` is not exported

- [ ] **Step 3: Write minimal implementation** — `src/lib/arb.ts` 끝에 추가:

```ts
/** 구간(일/월) 기록 테이블 행: 펀딩피 + 수익률 + 연 APR. */
export interface PeriodRow extends FundingBucket {
  returnPct: number;
  aprPct: number;
  hoursCovered: number;
}

/** 버킷의 전체 시간(ms). hour=1h, day=24h, month=해당 월 일수×24h. */
function bucketSpanMs(ts: number, period: FundingPeriod): number {
  if (period === "hour") return 3600000;
  if (period === "day") return 86400000;
  const d = new Date(ts);
  const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return days * 86400000;
}

/**
 * 구간별 수익률·연 APR 행을 만든다. 진행 중인 구간(now가 구간 안)은
 * 경과 시간만으로 연환산해 이른 시점의 값이 희석/과장되지 않게 한다.
 * 분모는 "현재 자본" — 시점별 자본 재구성은 하지 않는다(스펙에 명시된 단순화).
 */
export function buildPeriodRows(
  buckets: FundingBucket[],
  period: FundingPeriod,
  capitalUsd: number,
  nowMs: number
): PeriodRow[] {
  return buckets.map((b) => {
    const spanMs = bucketSpanMs(b.ts, period);
    const coveredMs = Math.max(0, Math.min(nowMs - b.ts, spanMs));
    const hoursCovered = coveredMs / 3600000;
    if (capitalUsd <= 0 || hoursCovered <= 0) {
      return { ...b, returnPct: 0, aprPct: 0, hoursCovered };
    }
    const returnPct = (b.usdc / capitalUsd) * 100;
    const aprPct = returnPct * (8760 / hoursCovered);
    return { ...b, returnPct, aprPct, hoursCovered };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/arb.test.ts`
Expected: PASS (전체)

- [ ] **Step 5: Commit**

```bash
git add src/lib/arb.ts tests/arb.test.ts
git commit -m "feat(arb): buildPeriodRows 구간 수익률/연 APR 헬퍼"
```

---

### Task 3: `getUserFundingAll` — userFunding 페이지네이션 + 캐시 연결

**Files:**
- Modify: `src/lib/hyperliquid.ts` (`getUserFunding` 아래에 추가)
- Modify: `src/app/arb/useFundingHistory.ts:23` (`getUserFunding` → `getUserFundingAll`)
- Test: `tests/hyperliquid.funding.test.ts` (신규)

**Interfaces:**
- Consumes: `getUserFunding(user, startTime, dex?, endTime?)`, `FundingEvent` (기존)
- Produces: `getUserFundingAll(user: string, startTime: number, dex?: string, endTime?: number): Promise<FundingEvent[]>` — 500건 커서 루프, `(time, hash, coin)` 기준 중복 제거, 시간 오름차순 반환

- [ ] **Step 1: Write the failing test** — `tests/hyperliquid.funding.test.ts` 신규 작성:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hyperliquid.funding.test.ts`
Expected: FAIL — `getUserFundingAll` is not exported

- [ ] **Step 3: Write minimal implementation** — `src/lib/hyperliquid.ts`의 `getUserFunding` 함수 바로 아래에 추가:

```ts
const FUNDING_PAGE_LIMIT = 500; // userFunding 응답 상한 (HL docs)
const FUNDING_MAX_PAGES = 12;

/**
 * userFunding 전체 이력 페이지네이션. 한 호출당 최대 500건이므로
 * 마지막 이벤트 time + 1을 커서로 이어받는다. 응답 정렬에 의존하지 않도록
 * max(time)을 쓰고, 페이지 경계 중복은 (time,hash,coin)으로 제거한다.
 */
export async function getUserFundingAll(
  user: string,
  startTime: number,
  dex?: string,
  endTime?: number
): Promise<FundingEvent[]> {
  const seen = new Set<string>();
  const out: FundingEvent[] = [];
  let cursor = startTime;

  for (let page = 0; page < FUNDING_MAX_PAGES; page++) {
    const batch = await getUserFunding(user, cursor, dex, endTime);
    if (batch.length === 0) break;
    for (const e of batch) {
      const k = `${e.time}|${e.hash}|${e.delta.coin}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(e);
    }
    if (batch.length < FUNDING_PAGE_LIMIT) break;
    const maxTime = batch.reduce((m, e) => Math.max(m, e.time), 0);
    if (maxTime + 1 <= cursor) break; // 방어: 커서가 전진하지 않으면 중단
    cursor = maxTime + 1;
  }
  return out.sort((a, b) => a.time - b.time);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/hyperliquid.funding.test.ts`
Expected: PASS (rate limiter 최소 간격 때문에 ~0.5s 소요 가능)

- [ ] **Step 5: 캐시 fetch를 페이지네이션 버전으로 교체** — `src/app/arb/useFundingHistory.ts`:

3행 import 를:

```ts
import { getUserFundingAll, type FundingEvent } from "@/lib/hyperliquid";
```

23행 `const events = await getUserFunding(address, ONE_YEAR_AGO(), "xyz");` 를:

```ts
  const events = await getUserFundingAll(address, ONE_YEAR_AGO(), "xyz");
```

- [ ] **Step 6: 전체 테스트 + 빌드 확인**

Run: `npx vitest run && npx tsc --noEmit`
Expected: 전체 PASS, 타입 에러 없음

- [ ] **Step 7: Commit**

```bash
git add src/lib/hyperliquid.ts src/app/arb/useFundingHistory.ts tests/hyperliquid.funding.test.ts
git commit -m "feat(hl): userFunding 페이지네이션 (500건 잘림 해결)"
```

---

### Task 4: `capitalStore` — 입출금 장부 localStorage store

**Files:**
- Create: `src/lib/capitalStore.ts`
- Test: `tests/capitalStore.test.ts` (신규 — `tests/arbStore.test.ts`의 localStorage mock 패턴 복제)

**Interfaces:**
- Produces:

```ts
export type CapitalVenue = "hl" | "kr" | "other";
export interface CapitalEvent {
  id: string;
  ts: number;          // 입출금 일시 (ms)
  venue: CapitalVenue; // hl=HL 입출금, kr=국내 증권사, other=기타 대기자금
  amountUsd: number;   // 입금 +, 출금 −
  memo?: string;
}
export function loadCapitalEvents(): CapitalEvent[]
export function addCapitalEvent(input: Omit<CapitalEvent, "id">): CapitalEvent
export function removeCapitalEvent(id: string): void
export function netFlowUsd(events: CapitalEvent[]): number            // 전체 순입금 (이력 요약용)
export function capitalAdjustmentUsd(events: CapitalEvent[]): number  // venue==="other"만 합산 (자본 가산분)
```

- [ ] **Step 1: Write the failing test** — `tests/capitalStore.test.ts` 신규 작성:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/capitalStore.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write minimal implementation** — `src/lib/capitalStore.ts` 신규 (arbStore.ts 패턴 그대로):

```ts
export type CapitalVenue = "hl" | "kr" | "other";

export interface CapitalEvent {
  id: string;
  /** 입출금 일시 (ms) */
  ts: number;
  /** hl=HL 입출금, kr=국내 증권사, other=기타 대기자금 (자본에 가산되는 유일한 구분) */
  venue: CapitalVenue;
  /** 입금 +, 출금 − (USD) */
  amountUsd: number;
  memo?: string;
}

const KEY = "hypurr_arb_capital_events";

function read(): CapitalEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CapitalEvent[]) : [];
  } catch {
    return [];
  }
}

function write(list: CapitalEvent[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadCapitalEvents(): CapitalEvent[] {
  return read();
}

export function addCapitalEvent(input: Omit<CapitalEvent, "id">): CapitalEvent {
  const e: CapitalEvent = { ...input, id: genId() };
  write([...read(), e]);
  return e;
}

export function removeCapitalEvent(id: string): void {
  write(read().filter((e) => e.id !== id));
}

/** 전체 순입금 — 이력 요약 표시용. */
export function netFlowUsd(events: CapitalEvent[]): number {
  return events.reduce((s, e) => s + e.amountUsd, 0);
}

/** 자본에 가산되는 조정분 — 라이브로 조회 불가한 기타 대기자금(venue "other")만.
 *  HL/국내 입출금은 예치금·현물원금에 이미 반영되므로 더하면 이중계상. */
export function capitalAdjustmentUsd(events: CapitalEvent[]): number {
  return events.filter((e) => e.venue === "other").reduce((s, e) => s + e.amountUsd, 0);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/capitalStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/capitalStore.ts tests/capitalStore.test.ts
git commit -m "feat(arb): 입출금 장부 capitalStore (localStorage)"
```

---

### Task 5: `fundingLedger` — 페어별 이벤트 수집 + 스탯 계산 (순수 로직)

**Files:**
- Create: `src/lib/fundingLedger.ts`
- Test: `tests/fundingLedger.test.ts` (신규)

**Interfaces:**
- Consumes: `ArbPair`, `pairOpenedAt` (`@/lib/arbStore`), `FundingEvent` (`@/lib/hyperliquid`)
- Produces:

```ts
export interface LedgerEvent {
  time: number;
  coin: string;      // "xyz:" 프리픽스 제거한 심볼 (예: "SKHX")
  usdc: number;
  rate: number;      // fundingRate 숫자
  nSamples: number;  // 합산 이벤트면 >1, 아니면 1
  pairId: string;
}
export function collectPairEvents(
  pairs: ArbPair[],
  fundingByAddress: Record<string, FundingEvent[]>,
  nowMs: number
): LedgerEvent[]  // 시간 오름차순, (time|coin|wallet) 중복 제거

export interface LedgerStats {
  totalUsdc: number;
  firstOpenedAt: number | null;
  elapsedDays: number;
  settlementCount: number;      // Σ nSamples
  lastHourUsdc: number | null;  // 가장 최근 정산 시간대 합계 (이벤트 없으면 null)
  lastHourTime: number | null;
}
export function calcLedgerStats(events: LedgerEvent[], pairs: ArbPair[], nowMs: number): LedgerStats
```

- [ ] **Step 1: Write the failing test** — `tests/fundingLedger.test.ts` 신규 작성:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fundingLedger.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: Write minimal implementation** — `src/lib/fundingLedger.ts` 신규:

```ts
import { pairOpenedAt, type ArbPair } from "@/lib/arbStore";
import type { FundingEvent } from "@/lib/hyperliquid";

/** 기록 페이지에서 쓰는 정규화된 펀딩 정산 이벤트. */
export interface LedgerEvent {
  time: number;
  /** "xyz:" 프리픽스를 벗긴 심볼 (예: "SKHX") */
  coin: string;
  usdc: number;
  rate: number;
  /** HL이 과거 이력을 합산 반환한 경우 >1 (예: 24 = 하루치) */
  nSamples: number;
  pairId: string;
}

/** 페어별 [openedAt, closedAt] 구간·심볼로 지갑 이벤트를 필터해 모은다.
 *  같은 지갑·심볼에 페어가 겹쳐도 (지갑|시각|코인) 키로 이중계상을 막는다. */
export function collectPairEvents(
  pairs: ArbPair[],
  fundingByAddress: Record<string, FundingEvent[]>,
  nowMs: number
): LedgerEvent[] {
  const seen = new Set<string>();
  const out: LedgerEvent[] = [];
  for (const p of pairs) {
    const addr = p.hlAddress.toLowerCase();
    const walletEvents = fundingByAddress[addr] ?? [];
    const from = pairOpenedAt(p);
    const to = p.closedAt ?? nowMs;
    const symbolShort = p.hlSymbol.split(":").pop() ?? p.hlSymbol;
    for (const e of walletEvents) {
      if (e.time < from || e.time > to) continue;
      if (e.delta.coin !== p.hlSymbol && e.delta.coin !== symbolShort) continue;
      const key = `${addr}|${e.time}|${symbolShort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        time: e.time,
        coin: symbolShort,
        usdc: parseFloat(e.delta.usdc),
        rate: parseFloat(e.delta.fundingRate),
        nSamples: e.delta.nSamples ?? 1,
        pairId: p.id,
      });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

export interface LedgerStats {
  totalUsdc: number;
  firstOpenedAt: number | null;
  elapsedDays: number;
  /** 정산 횟수 = Σ nSamples (합산 이벤트는 묶인 시간 수만큼 집계) */
  settlementCount: number;
  lastHourUsdc: number | null;
  lastHourTime: number | null;
}

/** 스탯 카드용 집계. 직전 펀비는 "가장 최근 정산이 속한 1시간 버킷"의 합. */
export function calcLedgerStats(events: LedgerEvent[], pairs: ArbPair[], nowMs: number): LedgerStats {
  const opened = pairs.map(pairOpenedAt);
  const firstOpenedAt = opened.length ? Math.min(...opened) : null;
  const elapsedDays = firstOpenedAt != null ? Math.max(0, nowMs - firstOpenedAt) / 86400000 : 0;

  let totalUsdc = 0;
  let settlementCount = 0;
  let latest = 0;
  for (const e of events) {
    totalUsdc += e.usdc;
    settlementCount += e.nSamples;
    if (e.time > latest) latest = e.time;
  }

  if (events.length === 0) {
    return { totalUsdc: 0, firstOpenedAt, elapsedDays, settlementCount: 0, lastHourUsdc: null, lastHourTime: null };
  }

  const hourStart = Math.floor(latest / 3600000) * 3600000;
  const lastHourUsdc = events
    .filter((e) => e.time >= hourStart && e.time < hourStart + 3600000)
    .reduce((s, e) => s + e.usdc, 0);

  return { totalUsdc, firstOpenedAt, elapsedDays, settlementCount, lastHourUsdc, lastHourTime: hourStart };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fundingLedger.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/fundingLedger.ts tests/fundingLedger.test.ts
git commit -m "feat(arb): fundingLedger 이벤트 수집·스탯 계산 (순수 로직)"
```

---

### Task 6: `useHlEquity` — HL 예치금 훅

**Files:**
- Create: `src/app/arb/history/useHlEquity.ts`

**Interfaces:**
- Consumes: `getClearinghouseState` (`@/lib/hyperliquid`)
- Produces: `useHlEquity(addresses: string[]): { totalEquityUsd: number | null; loading: boolean }` — 지갑별 일반 perp + `xyz` dex `accountValue` 합산, 30초 폴링

훅은 API 폴링 래퍼라 단위 테스트 없이 페이지 통합 확인(Task 9)으로 검증한다.

- [ ] **Step 1: Write implementation** — `src/app/arb/history/useHlEquity.ts` 신규 (`useHlXyzShorts.ts` 패턴):

```ts
"use client";
import { useEffect, useState } from "react";
import { getClearinghouseState } from "@/lib/hyperliquid";

/** 지갑 하나의 HL 예치금 = 일반 perp accountValue + xyz dex accountValue. */
async function fetchEquity(address: string): Promise<number> {
  const [std, xyz] = await Promise.all([
    getClearinghouseState(address).catch(() => null),
    getClearinghouseState(address, "xyz").catch(() => null),
  ]);
  const v = (s: { crossMarginSummary: { accountValue: string } } | null) =>
    s ? parseFloat(s.crossMarginSummary.accountValue) : 0;
  return v(std) + v(xyz);
}

export function useHlEquity(addresses: string[]): {
  totalEquityUsd: number | null;
  loading: boolean;
} {
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const key = addresses.join(",");

  useEffect(() => {
    if (addresses.length === 0) { setTotal(0); setLoading(false); return; }
    let cancelled = false;
    const load = async () => {
      const sums = await Promise.all(addresses.map((a) => fetchEquity(a).catch(() => 0)));
      if (cancelled) return;
      setTotal(sums.reduce((s, v) => s + v, 0));
      setLoading(false);
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { totalEquityUsd: total, loading };
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/app/arb/history/useHlEquity.ts
git commit -m "feat(arb): useHlEquity — HL 예치금(일반+xyz) 30초 폴링 훅"
```

---

### Task 7: 테이블 컴포넌트 — PeriodTable / HourlyTable

**Files:**
- Create: `src/app/arb/history/PeriodTable.tsx`
- Create: `src/app/arb/history/HourlyTable.tsx`

**Interfaces:**
- Consumes: `PeriodRow` (`@/lib/arb`), `LedgerEvent` (`@/lib/fundingLedger`), `formatUsd`, `pnlColor` (`@/lib/format`)
- Produces:
  - `<PeriodTable title="일별 기록" rows={PeriodRow[]} period="day" defaultVisible={14} aprReliable={boolean} />`
  - `<HourlyTable events={LedgerEvent[]} defaultVisible={48} />`

표시 규칙(HL 트레이드 UI 스타일): `bg-hl-bg-secondary border-hl-border rounded-xl` 카드, 헤더 `text-[11px] uppercase text-hl-text-tertiary`, 숫자 `font-mono` 우측 정렬, 양수 `text-hl-green` 음수 `text-hl-red`(`pnlColor`), 행 hover `hover:bg-hl-bg-hover`.

- [ ] **Step 1: PeriodTable 작성** — `src/app/arb/history/PeriodTable.tsx` 신규:

```tsx
"use client";
import { useState } from "react";
import type { PeriodRow, FundingPeriod } from "@/lib/arb";
import { formatUsd, pnlColor } from "@/lib/format";

interface Props {
  title: string;
  rows: PeriodRow[];       // 시간 오름차순 입력 → 최신부터 렌더
  period: FundingPeriod;   // "day" | "month" (라벨 포맷용)
  defaultVisible: number;
  /** 표본이 부족하면 APR 컬럼을 — 처리 (isAprReliable 판정 결과) */
  aprReliable: boolean;
}

function rowLabel(key: string, period: FundingPeriod): string {
  if (period === "month") {
    const [y, m] = key.split("-");
    return `${y}년 ${Number(m)}월`;
  }
  const [, m, d] = key.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export default function PeriodTable({ title, rows, period, defaultVisible, aprReliable }: Props) {
  const [expanded, setExpanded] = useState(false);
  const desc = [...rows].reverse();
  const visible = expanded ? desc : desc.slice(0, defaultVisible);
  const hidden = desc.length - visible.length;

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">{title}</h3>
        <span className="text-[11px] text-hl-text-tertiary font-mono">
          {rows.length}
          {period === "month" ? "개월" : "일"}
        </span>
      </div>
      {desc.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-xs text-hl-text-tertiary">
          정산 기록 없음
        </div>
      ) : (
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-hl-text-tertiary">
              <th className="text-left px-4 py-2 font-medium">{period === "month" ? "월" : "날짜"}</th>
              <th className="text-right px-4 py-2 font-medium">펀딩피</th>
              <th className="text-right px-4 py-2 font-medium">수익률</th>
              <th className="text-right px-4 py-2 font-medium">연 APR</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors">
                <td className="px-4 py-2 text-hl-text-secondary">{rowLabel(r.key, period)}</td>
                <td className={`px-4 py-2 text-right ${pnlColor(r.usdc)}`}>{formatUsd(r.usdc)}</td>
                <td className={`px-4 py-2 text-right ${pnlColor(r.returnPct)}`}>
                  {r.returnPct >= 0 ? "+" : ""}
                  {r.returnPct.toFixed(3)}%
                </td>
                <td className={`px-4 py-2 text-right ${aprReliable ? pnlColor(r.aprPct) : "text-hl-text-tertiary"}`}>
                  {aprReliable ? `${r.aprPct.toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-[11px] text-hl-text-secondary hover:text-hl-accent border-t border-hl-border transition-colors"
        >
          더보기 ({hidden}
          {period === "month" ? "개월" : "일"} 더)
        </button>
      )}
      {expanded && desc.length > defaultVisible && (
        <button
          onClick={() => setExpanded(false)}
          className="w-full py-2 text-[11px] text-hl-text-secondary hover:text-hl-accent border-t border-hl-border transition-colors"
        >
          접기
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: HourlyTable 작성** — `src/app/arb/history/HourlyTable.tsx` 신규:

```tsx
"use client";
import { useState } from "react";
import type { LedgerEvent } from "@/lib/fundingLedger";
import { formatUsd, pnlColor } from "@/lib/format";

interface Props {
  events: LedgerEvent[]; // 시간 오름차순 입력 → 최신부터 렌더
  defaultVisible: number;
}

function timeLabel(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:00`;
}

export default function HourlyTable({ events, defaultVisible }: Props) {
  const [visibleCount, setVisibleCount] = useState(defaultVisible);
  const desc = [...events].reverse();
  const visible = desc.slice(0, visibleCount);
  const hidden = desc.length - visible.length;

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">시간별 기록</h3>
        <span className="text-[11px] text-hl-text-tertiary font-mono">최근 {visible.length}건</span>
      </div>
      {desc.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-xs text-hl-text-tertiary">
          정산 기록 없음
        </div>
      ) : (
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-hl-text-tertiary">
              <th className="text-left px-4 py-2 font-medium">시각</th>
              <th className="text-left px-4 py-2 font-medium">코인</th>
              <th className="text-right px-4 py-2 font-medium">펀딩률</th>
              <th className="text-right px-4 py-2 font-medium">펀딩피</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((e) => (
              <tr
                key={`${e.time}-${e.coin}-${e.pairId}`}
                className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors"
              >
                <td className="px-4 py-1.5 text-hl-text-secondary">
                  {timeLabel(e.time)}
                  {e.nSamples > 1 && (
                    <span className="ml-1.5 px-1 py-px rounded bg-hl-bg-tertiary text-[9px] text-hl-text-tertiary">
                      {e.nSamples}h 합산
                    </span>
                  )}
                </td>
                <td className="px-4 py-1.5 text-hl-text-primary">{e.coin}</td>
                <td className={`px-4 py-1.5 text-right ${pnlColor(-e.rate)}`}>
                  {(e.rate * 100).toFixed(4)}%
                </td>
                <td className={`px-4 py-1.5 text-right ${pnlColor(e.usdc)}`}>{formatUsd(e.usdc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && (
        <button
          onClick={() => setVisibleCount((n) => n + 168)}
          className="w-full py-2 text-[11px] text-hl-text-secondary hover:text-hl-accent border-t border-hl-border transition-colors"
        >
          더보기 ({hidden}건 더)
        </button>
      )}
    </div>
  );
}
```

참고: 펀딩률 색은 `pnlColor(-e.rate)` — 숏 입장에서 양(+)의 펀딩률이 수익이므로 rate가 양수면 초록이 되도록 부호 반전. (usdc 자체는 이미 수취 부호라 그대로.)

- [ ] **Step 3: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: Commit**

```bash
git add src/app/arb/history/PeriodTable.tsx src/app/arb/history/HourlyTable.tsx
git commit -m "feat(arb): 월별/일별/시간별 기록 테이블 컴포넌트"
```

---

### Task 8: CapitalLedger — 입출금 기록 관리 UI

**Files:**
- Create: `src/app/arb/history/CapitalLedger.tsx`

**Interfaces:**
- Consumes: `loadCapitalEvents`, `addCapitalEvent`, `removeCapitalEvent`, `netFlowUsd`, `CapitalEvent`, `CapitalVenue` (`@/lib/capitalStore`), `formatUsd`, `groupDigits`, `pnlColor` (`@/lib/format`)
- Produces: `<CapitalLedger onChange={() => void} />` — 항목 추가/삭제 시 `onChange` 호출 (부모가 자본 재계산)

- [ ] **Step 1: Write implementation** — `src/app/arb/history/CapitalLedger.tsx` 신규:

```tsx
"use client";
import { useEffect, useState } from "react";
import {
  loadCapitalEvents,
  addCapitalEvent,
  removeCapitalEvent,
  netFlowUsd,
  type CapitalEvent,
  type CapitalVenue,
} from "@/lib/capitalStore";
import { formatUsd, groupDigits, pnlColor } from "@/lib/format";

const VENUE_LABEL: Record<CapitalVenue, string> = {
  hl: "HL",
  kr: "국내",
  other: "기타",
};

interface Props {
  /** 추가/삭제 후 부모가 자본 스탯을 다시 읽도록 알림 */
  onChange: () => void;
}

export default function CapitalLedger({ onChange }: Props) {
  const [events, setEvents] = useState<CapitalEvent[]>([]);
  const [venue, setVenue] = useState<CapitalVenue>("hl");
  const [amountRaw, setAmountRaw] = useState("");
  const [isWithdraw, setIsWithdraw] = useState(false);
  const [memo, setMemo] = useState("");
  const [dateStr, setDateStr] = useState(""); // yyyy-MM-dd, 빈 값이면 오늘

  useEffect(() => { setEvents(loadCapitalEvents()); }, []);

  const refresh = () => {
    setEvents(loadCapitalEvents());
    onChange();
  };

  const submit = () => {
    const amount = parseFloat(amountRaw.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const ts = dateStr ? new Date(`${dateStr}T12:00:00`).getTime() : Date.now();
    addCapitalEvent({
      ts,
      venue,
      amountUsd: isWithdraw ? -amount : amount,
      memo: memo.trim() || undefined,
    });
    setAmountRaw("");
    setMemo("");
    refresh();
  };

  const sorted = [...events].sort((a, b) => b.ts - a.ts);
  const net = netFlowUsd(events);

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">입출금 기록</h3>
        <span className={`text-[11px] font-mono ${pnlColor(net)}`}>
          순입금 {formatUsd(net)} · {events.length}건
        </span>
      </div>

      <div className="px-4 py-3 border-b border-hl-border flex flex-wrap items-center gap-2 text-xs">
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-hl-text-primary font-mono"
        />
        <div className="flex rounded overflow-hidden border border-hl-border">
          {(Object.keys(VENUE_LABEL) as CapitalVenue[]).map((v) => (
            <button
              key={v}
              onClick={() => setVenue(v)}
              className={`px-2 py-1 ${venue === v ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"}`}
            >
              {VENUE_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="flex rounded overflow-hidden border border-hl-border">
          {[false, true].map((w) => (
            <button
              key={String(w)}
              onClick={() => setIsWithdraw(w)}
              className={`px-2 py-1 ${isWithdraw === w ? (w ? "bg-hl-red/20 text-hl-red" : "bg-hl-green/20 text-hl-green") : "text-hl-text-secondary hover:bg-hl-bg-hover"}`}
            >
              {w ? "출금" : "입금"}
            </button>
          ))}
        </div>
        <input
          inputMode="decimal"
          placeholder="금액 (USD)"
          value={amountRaw}
          onChange={(e) => setAmountRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
          className="w-32 bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-right text-hl-text-primary font-mono"
        />
        <input
          placeholder="메모"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="flex-1 min-w-24 bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-hl-text-primary"
        />
        <button
          onClick={submit}
          className="px-3 py-1 rounded bg-hl-accent/20 text-hl-accent hover:bg-hl-accent/30 transition-colors"
        >
          추가
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="h-16 flex items-center justify-center text-xs text-hl-text-tertiary">
          기록 없음 — 기타(대기자금)만 투입 자본에 가산되고, HL/국내 건은 이력용이야
        </div>
      ) : (
        <table className="w-full text-xs font-mono">
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors">
                <td className="px-4 py-1.5 text-hl-text-secondary">
                  {new Date(e.ts).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                </td>
                <td className="px-2 py-1.5 text-hl-text-tertiary">{VENUE_LABEL[e.venue]}</td>
                <td className={`px-2 py-1.5 text-right ${pnlColor(e.amountUsd)}`}>{formatUsd(e.amountUsd)}</td>
                <td className="px-2 py-1.5 text-hl-text-tertiary truncate max-w-40">{e.memo ?? ""}</td>
                <td className="px-4 py-1.5 text-right">
                  <button
                    onClick={() => { removeCapitalEvent(e.id); refresh(); }}
                    className="text-hl-text-tertiary hover:text-hl-red transition-colors"
                    title="삭제"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 타입 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Commit**

```bash
git add src/app/arb/history/CapitalLedger.tsx
git commit -m "feat(arb): 입출금 기록 관리 UI"
```

---

### Task 9: StatGrid + 페이지 조립 + Sidebar 메뉴

**Files:**
- Create: `src/app/arb/history/StatGrid.tsx`
- Create: `src/app/arb/history/page.tsx`
- Modify: `src/components/Sidebar.tsx` (Arb 항목 뒤에 메뉴 추가)

**Interfaces:**
- Consumes: 앞선 모든 Task의 산출물 + `useLiveSnapshot`, `useHlXyzShorts`, `useArbPairs`, `useAprBasis`, `fetchFundingWithCache`, `aggregateFundingByPeriod`, `isAprReliable`, `calcRealizedAprPct`, `calcTotalReturnPct`
- Produces: `/arb/history` 라우트

- [ ] **Step 1: StatGrid 작성** — `src/app/arb/history/StatGrid.tsx` 신규:

```tsx
"use client";
import { useEffect, useState } from "react";
import StatCard from "@/components/StatCard";
import type { LedgerStats } from "@/lib/fundingLedger";
import { calcRealizedAprPct, calcTotalReturnPct, isAprReliable } from "@/lib/arb";
import { useAprBasis, APR_BASIS_LABEL } from "@/lib/aprBasis";
import { formatUsd, formatKrwCompact } from "@/lib/format";

interface Props {
  stats: LedgerStats;
  /** Σ(활성 페어 sizeAbs × markPx × fundingHourly) — 다음 정산 예상 수취액 */
  nextFundingUsd: number | null;
  spotPrincipalKrw: number;   // Σ quantity × avgPriceKrw (활성 페어)
  hlEquityUsd: number | null; // useHlEquity 합산
  otherAdjustUsd: number;     // capitalAdjustmentUsd
  capitalEventCount: number;
  usdKrwHana: number | null;
  loading: boolean;
}

function fmtStartDate(ts: number | null): string {
  if (ts == null) return "—";
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} 시작`;
}

export default function StatGrid({
  stats,
  nextFundingUsd,
  spotPrincipalKrw,
  hlEquityUsd,
  otherAdjustUsd,
  capitalEventCount,
  usdKrwHana,
  loading,
}: Props) {
  const { basis, setBasis } = useAprBasis();

  // 다음 정산(매시 정각)까지 카운트다운 — 1초마다 갱신
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const msToNextHour = 3600000 - (now % 3600000);
  const mm = Math.floor(msToNextHour / 60000);
  const ss = Math.floor((msToNextHour % 60000) / 1000);

  const spotPrincipalUsd =
    usdKrwHana != null && usdKrwHana > 0 ? spotPrincipalKrw / usdKrwHana : null;
  const fullCapital =
    hlEquityUsd != null && spotPrincipalUsd != null
      ? hlEquityUsd + spotPrincipalUsd + otherAdjustUsd
      : null;
  const capital = basis === "hl" ? hlEquityUsd : fullCapital;

  const elapsedHours = stats.elapsedDays * 24;
  const reliable = isAprReliable(elapsedHours, stats.settlementCount);
  const apr =
    capital != null && reliable
      ? calcRealizedAprPct({ totalFundingUsd: stats.totalUsdc, capitalUsd: capital, elapsedHours })
      : null;
  const totalReturn = capital != null ? calcTotalReturnPct(stats.totalUsdc, capital) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <span className="text-[11px] text-hl-text-tertiary uppercase tracking-wider">APR 기준</span>
        <div className="flex rounded-lg overflow-hidden border border-hl-border">
          {(["full", "hl"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBasis(b)}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                basis === b ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"
              }`}
            >
              {APR_BASIS_LABEL[b]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="누적 펀딩 수익"
          value={formatUsd(stats.totalUsdc)}
          subtitle={`${fmtStartDate(stats.firstOpenedAt)} · ${Math.floor(stats.elapsedDays)}일째 · 정산 ${stats.settlementCount.toLocaleString("en-US")}회`}
          loading={loading}
        />
        <StatCard
          title="자본 대비 연 APR"
          value={apr != null ? `${apr.toFixed(1)}%` : "—"}
          subtitle={
            capital == null
              ? "환율/예치금 조회 대기"
              : reliable
                ? `누적 수익률 ${totalReturn!.toFixed(2)}% · ${APR_BASIS_LABEL[basis]}`
                : "표본 부족 (24h·3회 미만)"
          }
          loading={loading}
        />
        <StatCard
          title="직전 펀비"
          value={stats.lastHourUsdc != null ? formatUsd(stats.lastHourUsdc) : "—"}
          subtitle={
            stats.lastHourTime != null
              ? new Date(stats.lastHourTime).toLocaleString("ko-KR", {
                  month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
                })
              : "정산 기록 없음"
          }
          loading={loading}
        />
        <StatCard
          title="다음 펀비 예상"
          value={nextFundingUsd != null ? formatUsd(nextFundingUsd) : "—"}
          subtitle={`정산까지 ${mm}:${String(ss).padStart(2, "0")}`}
          loading={loading}
        />
        <StatCard
          title="현재 투입 자본"
          value={fullCapital != null ? formatUsd(fullCapital) : "—"}
          subtitle={`입출금 ${capitalEventCount}건 기록${otherAdjustUsd !== 0 ? ` · 기타 ${formatUsd(otherAdjustUsd)}` : ""}`}
          loading={loading}
        />
        <StatCard
          title="현물 원금"
          value={formatKrwCompact(spotPrincipalKrw)}
          subtitle={spotPrincipalUsd != null ? formatUsd(spotPrincipalUsd) : "환율 대기"}
          loading={loading}
        />
        <StatCard
          title="HL 예치금"
          value={hlEquityUsd != null ? formatUsd(hlEquityUsd) : "—"}
          subtitle="일반 + xyz dex 합산 · 실시간"
          loading={loading}
        />
        <StatCard
          title="적용 환율"
          value={usdKrwHana != null ? `₩${usdKrwHana.toLocaleString("ko-KR")}` : "—"}
          subtitle="USD/KRW 하나은행"
          loading={loading}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 페이지 조립** — `src/app/arb/history/page.tsx` 신규:

```tsx
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLiveSnapshot } from "../useLiveSnapshot";
import { useHlXyzShorts } from "../useHlXyzShorts";
import { useArbPairs } from "@/hooks/useArbPairs";
import { fetchFundingWithCache } from "../useFundingHistory";
import { useHlEquity } from "./useHlEquity";
import type { FundingEvent } from "@/lib/hyperliquid";
import { collectPairEvents, calcLedgerStats } from "@/lib/fundingLedger";
import { aggregateFundingByPeriod, buildPeriodRows, isAprReliable } from "@/lib/arb";
import { loadCapitalEvents, capitalAdjustmentUsd } from "@/lib/capitalStore";
import { useAprBasis } from "@/lib/aprBasis";
import StatGrid from "./StatGrid";
import PeriodTable from "./PeriodTable";
import HourlyTable from "./HourlyTable";
import CapitalLedger from "./CapitalLedger";

export default function ArbHistoryPage() {
  const { snapshot } = useLiveSnapshot();
  const shorts = useHlXyzShorts();
  const { pairs } = useArbPairs(); // 청산 포함 전체 — 기록 페이지
  const { basis } = useAprBasis();

  // 청산 페어 포함 모든 지갑의 펀딩 이력
  const addresses = useMemo(
    () => Array.from(new Set(pairs.map((p) => p.hlAddress.toLowerCase()))).sort(),
    [pairs]
  );
  const addressesKey = addresses.join(",");
  const [fundingByAddress, setFundingByAddress] = useState<Record<string, FundingEvent[]>>({});
  const [fundingError, setFundingError] = useState(false);

  useEffect(() => {
    if (addresses.length === 0) { setFundingByAddress({}); return; }
    let cancelled = false;
    const load = async () => {
      let anyFailed = false;
      const results = await Promise.all(
        addresses.map(async (addr) => {
          try {
            return [addr, await fetchFundingWithCache(addr)] as const;
          } catch {
            anyFailed = true;
            return [addr, [] as FundingEvent[]] as const;
          }
        })
      );
      if (cancelled) return;
      const m: Record<string, FundingEvent[]> = {};
      for (const [addr, events] of results) m[addr] = events;
      setFundingByAddress(m);
      setFundingError(anyFailed);
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesKey]);

  // 활성 페어 지갑만 예치금 폴링 (청산 지갑은 자본에서 제외)
  const activePairs = useMemo(() => pairs.filter((p) => !p.closedAt), [pairs]);
  const activeAddresses = useMemo(
    () => Array.from(new Set(activePairs.map((p) => p.hlAddress.toLowerCase()))).sort(),
    [activePairs]
  );
  const { totalEquityUsd, loading: equityLoading } = useHlEquity(activeAddresses);

  const now = Date.now();
  const events = useMemo(
    () => collectPairEvents(pairs, fundingByAddress, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pairs, fundingByAddress]
  );
  const stats = useMemo(
    () => calcLedgerStats(events, pairs, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, pairs]
  );

  // 다음 펀비 예상 = Σ(활성 숏 노셔널 × 현재 시간당 펀딩률)
  const nextFundingUsd = useMemo(() => {
    if (!snapshot) return null;
    let sum = 0;
    let any = false;
    for (const p of activePairs) {
      const s = shorts.find(
        (x) => x.hlAddress.toLowerCase() === p.hlAddress.toLowerCase() && x.hlSymbol === p.hlSymbol
      );
      const hl = snapshot.hl[p.hlSymbol];
      if (!s || !hl) continue;
      any = true;
      sum += s.sizeAbs * hl.markPx * hl.fundingHourly;
    }
    return any ? sum : null;
  }, [snapshot, shorts, activePairs]);

  // 자본 (기준 토글 반영) — 테이블 수익률 분모
  const [capitalVersion, setCapitalVersion] = useState(0);
  const capitalEvents = useMemo(() => loadCapitalEvents(), [capitalVersion]);
  const otherAdjustUsd = capitalAdjustmentUsd(capitalEvents);
  const spotPrincipalKrw = activePairs.reduce(
    (s, p) => s + p.krLeg.quantity * p.krLeg.avgPriceKrw,
    0
  );
  const usdKrwHana = snapshot?.fx.usdKrwHana ?? null;
  const spotPrincipalUsd = usdKrwHana != null && usdKrwHana > 0 ? spotPrincipalKrw / usdKrwHana : null;
  const fullCapital =
    totalEquityUsd != null && spotPrincipalUsd != null
      ? totalEquityUsd + spotPrincipalUsd + otherAdjustUsd
      : null;
  const capitalForRows = basis === "hl" ? (totalEquityUsd ?? 0) : (fullCapital ?? 0);

  const dailyRows = useMemo(
    () => buildPeriodRows(aggregateFundingByPeriod(events, "day"), "day", capitalForRows, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, capitalForRows]
  );
  const monthlyRows = useMemo(
    () => buildPeriodRows(aggregateFundingByPeriod(events, "month"), "month", capitalForRows, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, capitalForRows]
  );
  const reliable = isAprReliable(stats.elapsedDays * 24, stats.settlementCount);

  const onCapitalChange = useCallback(() => setCapitalVersion((v) => v + 1), []);
  const loading = !snapshot && events.length === 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">Funding 수익 기록</h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            펀딩비 정산 이력 · 자본 대비 수익률
          </p>
        </div>
        <Link
          href="/arb"
          className="text-xs text-hl-text-secondary hover:text-hl-accent border border-hl-border rounded-lg px-3 py-1.5 transition-colors"
        >
          ← Arb 스캐너
        </Link>
      </div>

      {fundingError && (
        <div className="bg-hl-yellow/10 border border-hl-yellow/30 text-hl-yellow text-xs p-2 rounded-lg font-mono">
          일부 지갑의 펀딩 이력을 불러오지 못했어 — 합계가 실제보다 작을 수 있음
        </div>
      )}

      <StatGrid
        stats={stats}
        nextFundingUsd={nextFundingUsd}
        spotPrincipalKrw={spotPrincipalKrw}
        hlEquityUsd={totalEquityUsd}
        otherAdjustUsd={otherAdjustUsd}
        capitalEventCount={capitalEvents.length}
        usdKrwHana={usdKrwHana}
        loading={loading && equityLoading}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <PeriodTable title="월별 기록" rows={monthlyRows} period="month" defaultVisible={12} aprReliable={reliable} />
        <PeriodTable title="일별 기록" rows={dailyRows} period="day" defaultVisible={14} aprReliable={reliable} />
      </div>

      <HourlyTable events={events} defaultVisible={48} />

      <CapitalLedger onChange={onCapitalChange} />

      <footer className="pt-8 mt-8 border-t border-hl-border text-[11px] text-hl-text-tertiary font-mono leading-relaxed">
        <ul className="space-y-0.5">
          <li>· 데이터: api.hyperliquid.xyz userFunding(정산 이력) · clearinghouseState(예치금) · 하나은행 환율</li>
          <li>· 수익률 분모는 현재 자본 기준 — 과거 시점 자본 재구성 없음. 기타(대기자금) 입출금만 자본에 가산</li>
          <li className="text-hl-yellow/70">· 모든 수익률은 <span className="font-semibold">gross</span> — HL 수수료·국내 거래세·환전 스프레드 미반영</li>
        </ul>
      </footer>
    </div>
  );
}
```

- [ ] **Step 3: Sidebar 메뉴 추가** — `src/components/Sidebar.tsx`의 `navItems` 배열에서 Arb 항목(`href: "/arb"`) 바로 다음에 추가:

```tsx
  {
    href: "/arb/history",
    label: "Funding 기록",
    icon: (
      <svg
        className="w-[18px] h-[18px]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
```

주의: Sidebar의 활성 표시 로직이 `pathname === item.href`가 아니라 `startsWith`라면 `/arb`와 `/arb/history`가 동시 활성화될 수 있음 — 구현 시 해당 파일의 비교 방식을 확인하고, `startsWith`면 정확 일치(`===`)로 바꾼다.

- [ ] **Step 4: 전체 테스트 + 빌드**

Run: `npx vitest run && npx tsc --noEmit && npm run build`
Expected: 전체 PASS, 빌드 성공 (`/arb/history` 라우트 출력 확인)

- [ ] **Step 5: 수동 확인**

Run: `npm run dev` 후 브라우저에서 `http://localhost:3000/arb/history`
확인 항목:
1. 스탯 카드 8개가 렌더되고 페어가 있으면 누적 펀딩·예치금이 숫자로 채워짐
2. 월별/일별/시간별 테이블에 정산 이력 표시, 더보기/접기 동작
3. 입출금 추가(기타 $1,000) → "현재 투입 자본"이 $1,000 증가, 새로고침 후에도 유지
4. APR 기준 토글 전환 시 수익률/APR 값 변화
5. Sidebar에 "Funding 기록" 메뉴 + 활성 하이라이트

- [ ] **Step 6: Commit**

```bash
git add src/app/arb/history/ src/components/Sidebar.tsx
git commit -m "feat(arb): /arb/history 펀딩 수익 기록 페이지 (스탯+월별/일별/시간별+입출금)"
```

---

## Self-Review 결과

- 스펙 커버리지: 스탯 카드 8종(Task 9), 월별/일별(Task 2+7+9), 시간별(Task 5+7+9), 직전/다음 펀비(Task 5+9), 입출금 관리(Task 4+8), 페이지네이션(Task 3), 에러 처리(환율 대기 문구·지갑별 실패 배너·corrupt JSON fallback), 테스트(Task 1,2,3,4,5) — 스펙 전 항목 매핑 확인.
- 타입 일관성: `LedgerEvent`/`LedgerStats`(Task 5)를 Task 7·9가 동일 시그니처로 사용, `PeriodRow`(Task 2)를 Task 7·9가 사용, `CapitalEvent`(Task 4)를 Task 8·9가 사용 — 확인.
- 플레이스홀더 없음.
