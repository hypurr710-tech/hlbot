# Hypurr Funding Arbitrage Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Hyperliquid × KRX funding arbitrage tracker at `/arb` inside the existing hlbot repo. Shows a personal ledger of arb pairs (HL short + KR spot) plus an opportunity scanner ranked by APR.

**Architecture:** Next.js API route serves a single `LiveSnapshot` from an in-repo aggregator that combines Hyperliquid `info` API, Upbit public API, and NAVER 금융 scraping. Client polls every 5s, stores arb pair definitions in localStorage. Pure calculation functions (`lib/arb.ts`) drive all displayed numbers.

**Tech Stack:** Next.js 16 + React 19 + TypeScript + Tailwind + Recharts (existing) · Vitest 3 (new, for math + provider tests) · Zod (new, for aggregator response validation)

**Spec:** `docs/superpowers/specs/2026-07-12-hypurr-arb-tracker-design.md`

---

## File Structure

**New files:**
```
src/
  lib/
    arb.ts                          # pure calculations (premium, APR, delta, capital)
    arbStore.ts                     # ArbPair CRUD in localStorage
    tickerMap.ts                    # HL↔KR mapping (seed + overrides)
    tickerMap.seed.json             # base ticker registry shipped with app
    aggregator/
      types.ts                      # LiveSnapshot + Zod schemas
      naverSpot.ts                  # KR stock spot scraper
      naverFx.ts                    # USD/KRW scraper
      upbitFx.ts                    # USDT/KRW public API
      hlXyz.ts                      # xyz dex metaAndAssetCtxs wrapper

  app/
    api/aggregator/route.ts         # GET returns LiveSnapshot
    arb/
      page.tsx                      # split view container
      SummaryStrip.tsx
      LedgerPanel.tsx               # left panel (ledger)
      LedgerCard.tsx                # single pair card
      UnhedgedList.tsx              # HL shorts without KR leg
      PairEditModal.tsx             # add/edit KR leg
      ScannerPanel.tsx              # right panel (scanner)
      ScannerTable.tsx
      useLiveSnapshot.ts            # 5s polling hook

  hooks/
    useArbPairs.ts                  # arbStore React binding

tests/
  arb.test.ts
  aggregator/
    naverSpot.test.ts
    naverFx.test.ts
    upbitFx.test.ts
```

**Modified files:**
```
src/components/Sidebar.tsx          # add "Arb" nav item
package.json                        # add vitest, @vitest/coverage-v8, zod, jsdom
vitest.config.ts                    # NEW at repo root
```

---

## Task 1: Add test infrastructure (Vitest)

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Install vitest + zod**

Run in PowerShell from `C:\Users\USER\hlbot`:
```powershell
npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/dom
npm install zod
```

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 3: Add `test` script to `package.json`**

Change the `"scripts"` block to:
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 4: Write smoke test**

Create `tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run and confirm**

Run: `npm test`
Expected: 1 passing test.

- [ ] **Step 6: Commit**

```powershell
git add package.json package-lock.json vitest.config.ts tests/smoke.test.ts
git commit -m "chore: add vitest test infrastructure"
```

---

## Task 2: Ticker map (seed + storage)

**Files:**
- Create: `src/lib/tickerMap.seed.json`
- Create: `src/lib/tickerMap.ts`
- Create: `tests/tickerMap.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/tickerMap.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- tickerMap`
Expected: FAIL (module not found).

- [ ] **Step 3: Write seed data**

Create `src/lib/tickerMap.seed.json`:
```json
[
  { "hlSymbol": "xyz:SKHX", "krCode": "000660", "krName": "SK하이닉스", "market": "KOSPI" },
  { "hlSymbol": "xyz:SMSN", "krCode": "005930", "krName": "삼성전자", "market": "KOSPI" }
]
```

- [ ] **Step 4: Implement tickerMap**

Create `src/lib/tickerMap.ts`:
```typescript
import seed from "./tickerMap.seed.json";

export interface TickerMapEntry {
  hlSymbol: string;
  krCode: string;
  krName: string;
  market: "KOSPI" | "KOSDAQ";
}

const OVERRIDES_KEY = "hypurr_ticker_map_overrides";

function readOverrides(): TickerMapEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OVERRIDES_KEY);
    return raw ? (JSON.parse(raw) as TickerMapEntry[]) : [];
  } catch {
    return [];
  }
}

function writeOverrides(list: TickerMapEntry[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(OVERRIDES_KEY, JSON.stringify(list));
}

export function loadTickerMap(): TickerMapEntry[] {
  const overrides = readOverrides();
  const overrideSymbols = new Set(overrides.map((o) => o.hlSymbol));
  const filteredSeed = (seed as TickerMapEntry[]).filter(
    (s) => !overrideSymbols.has(s.hlSymbol)
  );
  return [...filteredSeed, ...overrides];
}

export function addTickerOverride(entry: TickerMapEntry): void {
  const current = readOverrides().filter((o) => o.hlSymbol !== entry.hlSymbol);
  writeOverrides([...current, entry]);
}

export function removeTickerOverride(hlSymbol: string): void {
  writeOverrides(readOverrides().filter((o) => o.hlSymbol !== hlSymbol));
}

export function getTickerByHl(hlSymbol: string): TickerMapEntry | undefined {
  return loadTickerMap().find((t) => t.hlSymbol === hlSymbol);
}
```

- [ ] **Step 5: Run and confirm**

Run: `npm test -- tickerMap`
Expected: 4 passing.

- [ ] **Step 6: Commit**

```powershell
git add src/lib/tickerMap.ts src/lib/tickerMap.seed.json tests/tickerMap.test.ts
git commit -m "feat: ticker map with seed + user overrides"
```

---

## Task 3: ArbPair storage

**Files:**
- Create: `src/lib/arbStore.ts`
- Create: `tests/arbStore.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/arbStore.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- arbStore`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement arbStore**

Create `src/lib/arbStore.ts`:
```typescript
export interface KrLeg {
  krCode: string;
  krName: string;
  quantity: number;
  avgPriceKrw: number;
  entryTs: number;
  brokerLabel?: string;
}

export interface ArbPair {
  id: string;
  hlAddress: string;
  hlSymbol: string;
  krLeg: KrLeg;
  createdAt: number;
  closedAt?: number;
  note?: string;
}

const KEY = "hypurr_arb_pairs";

function read(): ArbPair[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ArbPair[]) : [];
  } catch {
    return [];
  }
}

function write(list: ArbPair[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadArbPairs(): ArbPair[] {
  return read();
}

export function addArbPair(input: Omit<ArbPair, "id" | "createdAt">): ArbPair {
  const pair: ArbPair = { ...input, id: genId(), createdAt: Date.now() };
  write([...read(), pair]);
  return pair;
}

export function updateArbPair(id: string, patch: Partial<ArbPair>): void {
  write(read().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function removeArbPair(id: string): void {
  write(read().filter((p) => p.id !== id));
}

export function closeArbPair(id: string): void {
  updateArbPair(id, { closedAt: Date.now() });
}
```

- [ ] **Step 4: Run and confirm**

Run: `npm test -- arbStore`
Expected: 5 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/arbStore.ts tests/arbStore.test.ts
git commit -m "feat: ArbPair localStorage CRUD"
```

---

## Task 4: Pure calculations — premium

**Files:**
- Create: `src/lib/arb.ts`
- Create: `tests/arb.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/arb.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { calcPremiumPct, hlPriceKrw } from "@/lib/arb";

describe("arb.calcPremiumPct", () => {
  it("computes positive premium when HL is more expensive than KRX", () => {
    // HL SKHX $1474.85, USDT/KRW 1503.4, KR spot 2,180,000
    // hlKrw = 1474.85 * 1503.4 = 2,217,265.79
    // premium = (2217265.79 − 2180000) / 2180000 = 0.01709 → 1.71%
    const p = calcPremiumPct({
      hlMarkUsd: 1474.85,
      usdtKrw: 1503.4,
      krCloseKrw: 2180000,
    });
    expect(p).toBeCloseTo(1.71, 1);
  });

  it("returns negative premium when KRX is more expensive", () => {
    const p = calcPremiumPct({ hlMarkUsd: 1000, usdtKrw: 1500, krCloseKrw: 1600000 });
    expect(p).toBeLessThan(0);
  });

  it("returns 0 for equal prices", () => {
    const p = calcPremiumPct({ hlMarkUsd: 1000, usdtKrw: 1500, krCloseKrw: 1500000 });
    expect(p).toBeCloseTo(0, 5);
  });

  it("hlPriceKrw converts USD to KRW via USDT rate", () => {
    expect(hlPriceKrw(1474.85, 1503.4)).toBeCloseTo(2217265.79, 1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- arb`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement premium calc**

Create `src/lib/arb.ts`:
```typescript
export function hlPriceKrw(hlMarkUsd: number, usdtKrw: number): number {
  return hlMarkUsd * usdtKrw;
}

export function calcPremiumPct(args: {
  hlMarkUsd: number;
  usdtKrw: number;
  krCloseKrw: number;
}): number {
  const { hlMarkUsd, usdtKrw, krCloseKrw } = args;
  if (krCloseKrw === 0) return 0;
  const hlKrw = hlPriceKrw(hlMarkUsd, usdtKrw);
  return ((hlKrw - krCloseKrw) / krCloseKrw) * 100;
}
```

- [ ] **Step 4: Run and confirm**

Run: `npm test -- arb`
Expected: 4 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/arb.ts tests/arb.test.ts
git commit -m "feat(arb): premium percentage calculation"
```

---

## Task 5: Pure calculations — capital + APR

**Files:**
- Modify: `src/lib/arb.ts`
- Modify: `tests/arb.test.ts`

- [ ] **Step 1: Append tests to `tests/arb.test.ts`**

Add these blocks at the end of the file:
```typescript
import { calcCapitalUsd, calcAprPct } from "@/lib/arb";

describe("arb.calcCapitalUsd", () => {
  it("sums HL notional and KR spot cost", () => {
    // HL: 1 unit × $1474.85 = $1474.85
    // KR: 1 share × ₩2,170,000 / 1494 (hana) = $1452.48
    const c = calcCapitalUsd({
      hlSizeAbs: 1,
      hlMarkUsd: 1474.85,
      krQuantity: 1,
      krAvgPriceKrw: 2170000,
      usdKrwHana: 1494,
    });
    expect(c).toBeCloseTo(2927.33, 1);
  });

  it("returns 0 when both sides are 0", () => {
    expect(calcCapitalUsd({
      hlSizeAbs: 0, hlMarkUsd: 100, krQuantity: 0, krAvgPriceKrw: 100, usdKrwHana: 1000
    })).toBe(0);
  });
});

describe("arb.calcAprPct", () => {
  it("annualizes hourly funding against total capital", () => {
    // Notional $1474.85, funding 0.0055%/h = 0.000055, capital $2927.33
    // fundingUsd/h = 1474.85 * 0.000055 = 0.081117
    // annual = 0.081117 * 8760 = 710.58
    // APR = 710.58 / 2927.33 = 24.27%
    const apr = calcAprPct({
      hlNotionalUsd: 1474.85,
      fundingHourly: 0.000055,
      capitalUsd: 2927.33,
    });
    expect(apr).toBeCloseTo(24.27, 1);
  });

  it("returns 0 when capital is 0", () => {
    expect(calcAprPct({ hlNotionalUsd: 100, fundingHourly: 0.0001, capitalUsd: 0 })).toBe(0);
  });

  it("returns negative APR when funding is negative", () => {
    const apr = calcAprPct({ hlNotionalUsd: 1000, fundingHourly: -0.0001, capitalUsd: 2000 });
    expect(apr).toBeLessThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm test -- arb`
Expected: FAIL on new tests (functions not defined).

- [ ] **Step 3: Add capital + APR to `arb.ts`**

Append to `src/lib/arb.ts`:
```typescript
export function calcCapitalUsd(args: {
  hlSizeAbs: number;
  hlMarkUsd: number;
  krQuantity: number;
  krAvgPriceKrw: number;
  usdKrwHana: number;
}): number {
  const { hlSizeAbs, hlMarkUsd, krQuantity, krAvgPriceKrw, usdKrwHana } = args;
  const hlNotional = hlSizeAbs * hlMarkUsd;
  const krCostKrw = krQuantity * krAvgPriceKrw;
  const krCostUsd = usdKrwHana > 0 ? krCostKrw / usdKrwHana : 0;
  return hlNotional + krCostUsd;
}

export function calcAprPct(args: {
  hlNotionalUsd: number;
  fundingHourly: number;
  capitalUsd: number;
}): number {
  const { hlNotionalUsd, fundingHourly, capitalUsd } = args;
  if (capitalUsd === 0) return 0;
  const perHourUsd = hlNotionalUsd * fundingHourly;
  const perYearUsd = perHourUsd * 24 * 365;
  return (perYearUsd / capitalUsd) * 100;
}
```

- [ ] **Step 4: Run and confirm**

Run: `npm test -- arb`
Expected: all 9 passing.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/arb.ts tests/arb.test.ts
git commit -m "feat(arb): capital and APR calculations"
```

---

## Task 6: Pure calculations — delta neutrality

**Files:**
- Modify: `src/lib/arb.ts`
- Modify: `tests/arb.test.ts`

- [ ] **Step 1: Append tests**

Add to `tests/arb.test.ts`:
```typescript
import { calcDeltaMismatchPct, isDeltaNeutral } from "@/lib/arb";

describe("arb.calcDeltaMismatchPct", () => {
  it("returns near zero for balanced pair", () => {
    // HL notional: 1 × $1474 = $1474
    // KR notional now: 1 × ₩2,180,000 / 1494 = $1459
    // mismatch: (1474 - 1459) / 1459 = 1.03%
    const d = calcDeltaMismatchPct({
      hlSizeAbs: 1,
      hlMarkUsd: 1474,
      krQuantity: 1,
      krCloseKrw: 2180000,
      usdKrwHana: 1494,
    });
    expect(Math.abs(d)).toBeLessThan(3);
  });

  it("returns > 3 for imbalanced pair", () => {
    // 2 HL shorts, only 1 KR share
    const d = calcDeltaMismatchPct({
      hlSizeAbs: 2,
      hlMarkUsd: 1474,
      krQuantity: 1,
      krCloseKrw: 2180000,
      usdKrwHana: 1494,
    });
    expect(Math.abs(d)).toBeGreaterThan(50);
  });
});

describe("arb.isDeltaNeutral", () => {
  it("true when |mismatch| < 3", () => {
    expect(isDeltaNeutral(1.5)).toBe(true);
    expect(isDeltaNeutral(-2.9)).toBe(true);
  });
  it("false when |mismatch| >= 3", () => {
    expect(isDeltaNeutral(3.0)).toBe(false);
    expect(isDeltaNeutral(-5)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- arb`
Expected: FAIL on new tests.

- [ ] **Step 3: Append to `arb.ts`**

```typescript
export function calcDeltaMismatchPct(args: {
  hlSizeAbs: number;
  hlMarkUsd: number;
  krQuantity: number;
  krCloseKrw: number;
  usdKrwHana: number;
}): number {
  const { hlSizeAbs, hlMarkUsd, krQuantity, krCloseKrw, usdKrwHana } = args;
  const hlNotional = hlSizeAbs * hlMarkUsd;
  const krNotionalUsd = usdKrwHana > 0 ? (krQuantity * krCloseKrw) / usdKrwHana : 0;
  if (krNotionalUsd === 0) return hlNotional === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((hlNotional - krNotionalUsd) / krNotionalUsd) * 100;
}

export const DELTA_NEUTRAL_THRESHOLD_PCT = 3;

export function isDeltaNeutral(mismatchPct: number): boolean {
  return Math.abs(mismatchPct) < DELTA_NEUTRAL_THRESHOLD_PCT;
}
```

- [ ] **Step 4: Run and confirm**

Run: `npm test -- arb`
Expected: all tests passing.

- [ ] **Step 5: Commit**

```powershell
git add src/lib/arb.ts tests/arb.test.ts
git commit -m "feat(arb): delta neutrality check"
```

---

## Task 7: Aggregator types + Zod schemas

**Files:**
- Create: `src/lib/aggregator/types.ts`

- [ ] **Step 1: Create types file**

Create `src/lib/aggregator/types.ts`:
```typescript
import { z } from "zod";

export const HlAssetCtxSchema = z.object({
  markPx: z.number(),
  midPx: z.number(),
  fundingHourly: z.number(),
  premium: z.number(),
  openInterest: z.number(),
  dayNtlVlm: z.number(),
});

export const KrQuoteSchema = z.object({
  close: z.number(),
  prevClose: z.number(),
  nxtPrice: z.number().nullable(),
  nxtSession: z.enum(["PRE", "AFTER_MARKET"]).nullable(),
  marketOpen: z.boolean(),
});

export const LiveSnapshotSchema = z.object({
  ts: z.number(),
  fx: z.object({
    usdKrwHana: z.number().nullable(),
    usdtKrwUpbit: z.number().nullable(),
  }),
  hl: z.record(z.string(), HlAssetCtxSchema),
  kr: z.record(z.string(), KrQuoteSchema),
  warnings: z.array(z.string()),
});

export type HlAssetCtx = z.infer<typeof HlAssetCtxSchema>;
export type KrQuote = z.infer<typeof KrQuoteSchema>;
export type LiveSnapshot = z.infer<typeof LiveSnapshotSchema>;
```

- [ ] **Step 2: Commit**

```powershell
git add src/lib/aggregator/types.ts
git commit -m "feat(aggregator): LiveSnapshot Zod schemas"
```

---

## Task 8: Upbit FX provider

**Files:**
- Create: `src/lib/aggregator/upbitFx.ts`
- Create: `tests/aggregator/upbitFx.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/aggregator/upbitFx.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- upbitFx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/aggregator/upbitFx.ts`:
```typescript
const URL = "https://api.upbit.com/v1/ticker?markets=KRW-USDT";

export async function fetchUpbitUsdtKrw(): Promise<number | null> {
  try {
    const res = await fetch(URL, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ trade_price?: number }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const px = data[0]?.trade_price;
    return typeof px === "number" && px > 0 ? px : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run and commit**

Run: `npm test -- upbitFx` (expect 4 passing).

```powershell
git add src/lib/aggregator/upbitFx.ts tests/aggregator/upbitFx.test.ts
git commit -m "feat(aggregator): Upbit USDT/KRW provider"
```

---

## Task 9: NAVER USD/KRW provider

**Files:**
- Create: `src/lib/aggregator/naverFx.ts`
- Create: `tests/aggregator/naverFx.test.ts`

**Background**: NAVER exchange detail page returns HTML; the current USD/KRW is embedded as text in `<em class="no_up">` or `<em class="no_down">` near the `_gnb_exchange_price` region. Exact selector may vary; the parser looks for a `data-price` attribute or falls back to a text pattern like `1,494.00`.

- [ ] **Step 1: Write failing test with recorded fixture**

Create `tests/aggregator/naverFx.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchNaverUsdKrw, parseNaverUsdKrwHtml } from "@/lib/aggregator/naverFx";

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const HTML_FIXTURE = `
<html><body>
<div class="head_info">
  <span class="no_today"><em class="no_up">
    <span class="ino">1,494.00</span>
  </em></span>
</div>
</body></html>
`;

describe("naverFx", () => {
  it("parses USD/KRW from NAVER HTML", () => {
    expect(parseNaverUsdKrwHtml(HTML_FIXTURE)).toBe(1494);
  });

  it("returns null for malformed HTML", () => {
    expect(parseNaverUsdKrwHtml("<html></html>")).toBeNull();
  });

  it("fetch returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    expect(await fetchNaverUsdKrw()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- naverFx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/aggregator/naverFx.ts`:
```typescript
const URL =
  "https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Extract the current USD/KRW rate from the NAVER exchange detail HTML. */
export function parseNaverUsdKrwHtml(html: string): number | null {
  // NAVER renders the price inside <span class="ino">1,494.00</span>
  const match = html.match(/<span class="ino">([\d,]+\.\d+)<\/span>/);
  if (!match) return null;
  const num = parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(num) && num > 0 ? num : null;
}

export async function fetchNaverUsdKrw(): Promise<number | null> {
  try {
    const res = await fetch(URL, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseNaverUsdKrwHtml(html);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Verify against live NAVER page**

Run in PowerShell to sanity-check the real HTML matches the parser:
```powershell
$html = Invoke-WebRequest -Uri "https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW" -UserAgent "Mozilla/5.0" -UseBasicParsing | Select-Object -ExpandProperty Content
$html | Select-String -Pattern 'class="ino">([\d,]+\.\d+)<' -AllMatches | ForEach-Object { $_.Matches.Value }
```
Expected: at least one match printed. If not, inspect the HTML, update the regex in `parseNaverUsdKrwHtml`, and re-run tests.

- [ ] **Step 5: Run and commit**

Run: `npm test -- naverFx` (expect 3 passing).

```powershell
git add src/lib/aggregator/naverFx.ts tests/aggregator/naverFx.test.ts
git commit -m "feat(aggregator): NAVER USD/KRW scraper"
```

---

## Task 10: NAVER stock spot provider

**Files:**
- Create: `src/lib/aggregator/naverSpot.ts`
- Create: `tests/aggregator/naverSpot.test.ts`

**Background**: `finance.naver.com/item/main.naver?code=<code>` embeds the current price. The mobile endpoint `m.stock.naver.com/api/stock/<code>/basic` returns JSON — prefer JSON. Fields on the JSON: `closePrice` (regular session close/current), `nxtClosePrice` (NXT), `nxtSessionStatus`.

- [ ] **Step 1: Write failing test**

Create `tests/aggregator/naverSpot.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchNaverSpot } from "@/lib/aggregator/naverSpot";

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

const jsonResp = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });

describe("naverSpot", () => {
  it("parses close and prevClose from mobile JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp({
      closePrice: "2,180,000",
      openPrice: "2,175,000",
      lowPrice: "2,150,000",
      highPrice: "2,190,000",
      compareToPreviousClosePrice: "-6,000",
      accumulatedTradingVolume: "12345",
    })));
    const q = await fetchNaverSpot("000660");
    expect(q?.close).toBe(2180000);
    expect(q?.prevClose).toBe(2186000);
  });

  it("returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await fetchNaverSpot("000660")).toBeNull();
  });

  it("returns null on missing fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResp({})));
    expect(await fetchNaverSpot("000660")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- naverSpot`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/lib/aggregator/naverSpot.ts`:
```typescript
import type { KrQuote } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function num(s: unknown): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (typeof s !== "string") return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Fetch KR spot quote for a KRX code (e.g. "000660"). */
export async function fetchNaverSpot(krCode: string): Promise<KrQuote | null> {
  const url = `https://m.stock.naver.com/api/stock/${krCode}/basic`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const close = num(data.closePrice);
    const change = num(data.compareToPreviousClosePrice);
    if (close === null || change === null) return null;

    const prevClose = close - change;
    const nxtPrice = num(data.nxtClosePrice ?? data.afterMarketPrice);
    const nxtSessionRaw = String(data.nxtSessionStatus ?? "").toUpperCase();
    const nxtSession =
      nxtSessionRaw === "PRE" || nxtSessionRaw === "AFTER_MARKET"
        ? (nxtSessionRaw as "PRE" | "AFTER_MARKET")
        : null;

    // Rough market-open heuristic: 09:00–15:30 KST on weekdays.
    const now = new Date();
    const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 9 * 60) * 60000);
    const day = kst.getUTCDay(); // treat UTC-shifted as KST
    const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes();
    const marketOpen = day >= 1 && day <= 5 && mins >= 9 * 60 && mins <= 15 * 60 + 30;

    return { close, prevClose, nxtPrice, nxtSession, marketOpen };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Verify against live NAVER endpoint**

```powershell
Invoke-WebRequest -Uri "https://m.stock.naver.com/api/stock/000660/basic" -UserAgent "Mozilla/5.0" -UseBasicParsing | Select-Object -ExpandProperty Content | Out-String
```
Expected: JSON with `closePrice`, `compareToPreviousClosePrice` fields. If field names differ, update the parser and rerun tests.

- [ ] **Step 5: Run and commit**

Run: `npm test -- naverSpot` (expect 3 passing).

```powershell
git add src/lib/aggregator/naverSpot.ts tests/aggregator/naverSpot.test.ts
git commit -m "feat(aggregator): NAVER spot quote scraper"
```

---

## Task 11: Hyperliquid xyz dex provider

**Files:**
- Create: `src/lib/aggregator/hlXyz.ts`

**Background**: Hyperliquid `info` API supports `type: "metaAndAssetCtxs"` and `type: "perpDexs"`. HIP-3 dexes need `{ type: "metaAndAssetCtxs", dex: "xyz" }`. Response is `[meta, assetCtxs[]]` where `meta.universe[i].name` pairs with `assetCtxs[i]`.

- [ ] **Step 1: Implement provider**

Create `src/lib/aggregator/hlXyz.ts`:
```typescript
import type { HlAssetCtx } from "./types";

const API_URL = "https://api.hyperliquid.xyz/info";
const DEX = "xyz";

interface RawUniverse {
  name: string;
}

interface RawAssetCtx {
  markPx: string;
  midPx?: string;
  funding: string;
  premium: string;
  openInterest: string;
  dayNtlVlm: string;
}

function toNum(s: string | undefined): number {
  const n = s === undefined ? NaN : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchHlXyzCtxs(): Promise<Record<string, HlAssetCtx>> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs", dex: DEX }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HL info API error ${res.status}`);
  const data = (await res.json()) as [{ universe: RawUniverse[] }, RawAssetCtx[]];
  if (!Array.isArray(data) || data.length !== 2) throw new Error("HL info API bad shape");
  const [meta, ctxs] = data;

  const out: Record<string, HlAssetCtx> = {};
  for (let i = 0; i < meta.universe.length; i++) {
    const name = meta.universe[i]?.name;
    const c = ctxs[i];
    if (!name || !c) continue;
    const hlSymbol = `${DEX}:${name}`;
    out[hlSymbol] = {
      markPx: toNum(c.markPx),
      midPx: toNum(c.midPx ?? c.markPx),
      fundingHourly: toNum(c.funding),
      premium: toNum(c.premium),
      openInterest: toNum(c.openInterest),
      dayNtlVlm: toNum(c.dayNtlVlm),
    };
  }
  return out;
}
```

- [ ] **Step 2: Verify against live API**

```powershell
$body = '{"type":"metaAndAssetCtxs","dex":"xyz"}'
Invoke-RestMethod -Uri "https://api.hyperliquid.xyz/info" -Method Post -Body $body -ContentType "application/json" | ConvertTo-Json -Depth 4 | Out-String
```
Expected: JSON with `universe` (names like `SKHX`, `SMSN`) and matching `assetCtxs` entries.

- [ ] **Step 3: Commit**

```powershell
git add src/lib/aggregator/hlXyz.ts
git commit -m "feat(aggregator): Hyperliquid xyz dex assetCtxs fetcher"
```

---

## Task 12: Aggregator API route

**Files:**
- Create: `src/app/api/aggregator/route.ts`

- [ ] **Step 1: Implement combined aggregator**

Create `src/app/api/aggregator/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { fetchHlXyzCtxs } from "@/lib/aggregator/hlXyz";
import { fetchUpbitUsdtKrw } from "@/lib/aggregator/upbitFx";
import { fetchNaverUsdKrw } from "@/lib/aggregator/naverFx";
import { fetchNaverSpot } from "@/lib/aggregator/naverSpot";
import { LiveSnapshotSchema, type LiveSnapshot } from "@/lib/aggregator/types";
import seed from "@/lib/tickerMap.seed.json";

interface SeedEntry { hlSymbol: string; krCode: string; krName: string; market: string }
const seedList = seed as SeedEntry[];

interface CacheEntry<T> { value: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.value as T);
  return fn().then((v) => {
    cache.set(key, { value: v, ts: Date.now() });
    return v;
  });
}

export async function GET() {
  const warnings: string[] = [];

  const [hlResult, upbitResult, naverFxResult] = await Promise.allSettled([
    cached("hl:xyz", 5000, fetchHlXyzCtxs),
    cached("fx:upbit", 5000, fetchUpbitUsdtKrw),
    cached("fx:naver", 30000, fetchNaverUsdKrw),
  ]);

  const hl = hlResult.status === "fulfilled" ? hlResult.value : {};
  if (hlResult.status === "rejected") warnings.push("hl_xyz_failed");

  const usdtKrwUpbit = upbitResult.status === "fulfilled" ? upbitResult.value : null;
  if (upbitResult.status === "rejected" || usdtKrwUpbit === null) warnings.push("upbit_failed");

  const usdKrwHana = naverFxResult.status === "fulfilled" ? naverFxResult.value : null;
  if (naverFxResult.status === "rejected" || usdKrwHana === null) warnings.push("naver_fx_failed");

  // Fetch KR spots for every mapped symbol in parallel
  const krEntries = await Promise.all(
    seedList.map(async (t) => {
      const q = await cached(`kr:${t.krCode}`, 5000, () => fetchNaverSpot(t.krCode));
      return [t.hlSymbol, q] as const;
    })
  );
  const kr: LiveSnapshot["kr"] = {};
  for (const [hlSymbol, q] of krEntries) {
    if (q) kr[hlSymbol] = q;
    else warnings.push(`naver_spot_${hlSymbol}_failed`);
  }

  const snapshot: LiveSnapshot = {
    ts: Date.now(),
    fx: { usdKrwHana, usdtKrwUpbit },
    hl,
    kr,
    warnings,
  };

  const parsed = LiveSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "snapshot_validation_failed", detail: parsed.error.flatten() },
      { status: 500 }
    );
  }
  return NextResponse.json(parsed.data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
```

- [ ] **Step 2: Manual verification**

Run: `npm run dev` (background). Then in a new terminal:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/aggregator" | ConvertTo-Json -Depth 5 | Out-String
```
Expected: JSON with non-empty `hl`, non-null FX rates, populated `kr`. Any populated `warnings` array indicates a partial-failure to investigate but the route should still return 200.

Stop `npm run dev` when done.

- [ ] **Step 3: Commit**

```powershell
git add src/app/api/aggregator/route.ts
git commit -m "feat(aggregator): unified /api/aggregator route with caching"
```

---

## Task 13: Sidebar nav — add Arb entry

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: Insert new nav item**

In `src/components/Sidebar.tsx`, add a new entry to `navItems` right after the `/address` entry (line 44, before `/trades`):

```tsx
  {
    href: "/arb",
    label: "Arb",
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
          d="M8 7h12m0 0l-4-4m4 4l-4 4M16 17H4m0 0l4 4m-4-4l4-4"
        />
      </svg>
    ),
  },
```

- [ ] **Step 2: Commit**

```powershell
git add src/components/Sidebar.tsx
git commit -m "feat(nav): add Arb entry to sidebar"
```

---

## Task 14: `/arb` page scaffold + live snapshot hook

**Files:**
- Create: `src/app/arb/page.tsx`
- Create: `src/app/arb/useLiveSnapshot.ts`

- [ ] **Step 1: Create polling hook**

Create `src/app/arb/useLiveSnapshot.ts`:
```typescript
"use client";
import { useEffect, useRef, useState } from "react";
import type { LiveSnapshot } from "@/lib/aggregator/types";

const POLL_MS = 5000;

export function useLiveSnapshot() {
  const [snapshot, setSnapshot] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/aggregator", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as LiveSnapshot;
        if (!cancelled) {
          setSnapshot(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "fetch failed");
      }
    };
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  return { snapshot, error };
}
```

- [ ] **Step 2: Create page scaffold**

Create `src/app/arb/page.tsx`:
```tsx
"use client";
import { useLiveSnapshot } from "./useLiveSnapshot";

export default function ArbPage() {
  const { snapshot, error } = useLiveSnapshot();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
            Funding Arbitrage
          </h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            Hyperliquid × KRX 델타 헤지 원장
          </p>
        </div>
        {snapshot && (
          <div className="text-xs text-hl-text-tertiary font-mono">
            USDT/KRW {snapshot.fx.usdtKrwUpbit?.toFixed(2) ?? "—"} · USD/KRW{" "}
            {snapshot.fx.usdKrwHana?.toFixed(2) ?? "—"}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-hl-red/10 border border-hl-red/30 text-hl-red text-sm p-3 rounded-lg">
          Aggregator error: {error}
        </div>
      )}

      {snapshot && snapshot.warnings.length > 0 && (
        <div className="bg-hl-yellow/10 border border-hl-yellow/30 text-hl-yellow text-xs p-2 rounded-lg font-mono">
          Warnings: {snapshot.warnings.join(", ")}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Ledger */}
        <section>
          <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
            My Ledger
          </h2>
          <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-6 text-sm text-hl-text-secondary">
            Ledger placeholder — LedgerPanel wired in Task 16.
          </div>
        </section>

        {/* Right: Scanner */}
        <section>
          <h2 className="text-lg font-semibold text-hl-text-primary mb-4">
            Opportunity Scanner
          </h2>
          <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-6 text-sm text-hl-text-secondary">
            Scanner placeholder — ScannerPanel wired in Task 17.
          </div>
        </section>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Manual verify**

`npm run dev`, navigate to `http://localhost:3000/arb`. Expected: page renders, FX rates appear in the top-right, warnings banner shows if any upstream failed. Stop dev server.

- [ ] **Step 4: Commit**

```powershell
git add src/app/arb/page.tsx src/app/arb/useLiveSnapshot.ts
git commit -m "feat(arb): scaffold /arb split-view page + polling hook"
```

---

## Task 15: `useArbPairs` React binding

**Files:**
- Create: `src/hooks/useArbPairs.ts`

- [ ] **Step 1: Implement**

Create `src/hooks/useArbPairs.ts`:
```typescript
"use client";
import { useCallback, useEffect, useState } from "react";
import {
  loadArbPairs,
  addArbPair as add,
  updateArbPair as update,
  removeArbPair as remove,
  closeArbPair as close,
  type ArbPair,
} from "@/lib/arbStore";

export function useArbPairs() {
  const [pairs, setPairs] = useState<ArbPair[]>([]);

  useEffect(() => { setPairs(loadArbPairs()); }, []);

  const addPair = useCallback((input: Omit<ArbPair, "id" | "createdAt">) => {
    add(input);
    setPairs(loadArbPairs());
  }, []);

  const updatePair = useCallback((id: string, patch: Partial<ArbPair>) => {
    update(id, patch);
    setPairs(loadArbPairs());
  }, []);

  const removePair = useCallback((id: string) => {
    remove(id);
    setPairs(loadArbPairs());
  }, []);

  const closePair = useCallback((id: string) => {
    close(id);
    setPairs(loadArbPairs());
  }, []);

  return { pairs, addPair, updatePair, removePair, closePair };
}
```

- [ ] **Step 2: Commit**

```powershell
git add src/hooks/useArbPairs.ts
git commit -m "feat: useArbPairs React hook"
```

---

## Task 16: Ledger panel — LedgerCard + UnhedgedList + PairEditModal

**Files:**
- Create: `src/app/arb/LedgerCard.tsx`
- Create: `src/app/arb/UnhedgedList.tsx`
- Create: `src/app/arb/PairEditModal.tsx`
- Create: `src/app/arb/LedgerPanel.tsx`
- Modify: `src/app/arb/page.tsx`

- [ ] **Step 1: Create LedgerCard**

Create `src/app/arb/LedgerCard.tsx`:
```tsx
"use client";
import type { ArbPair } from "@/lib/arbStore";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import {
  calcPremiumPct,
  calcCapitalUsd,
  calcAprPct,
  calcDeltaMismatchPct,
  isDeltaNeutral,
} from "@/lib/arb";
import { formatUsd, pnlColor } from "@/lib/format";

interface Props {
  pair: ArbPair;
  hlSizeAbs: number;
  hlMarkUsd: number;
  fundingHourly: number;
  cumFundingUsd: number;
  krCloseKrw: number;
  usdKrwHana: number;
  usdtKrwUpbit: number;
  krName: string;
  onEdit: () => void;
  onClose: () => void;
}

export default function LedgerCard({
  pair, hlSizeAbs, hlMarkUsd, fundingHourly, cumFundingUsd,
  krCloseKrw, usdKrwHana, usdtKrwUpbit, krName, onEdit, onClose,
}: Props) {
  const premium = calcPremiumPct({ hlMarkUsd, usdtKrw: usdtKrwUpbit, krCloseKrw });
  const capital = calcCapitalUsd({
    hlSizeAbs, hlMarkUsd,
    krQuantity: pair.krLeg.quantity, krAvgPriceKrw: pair.krLeg.avgPriceKrw, usdKrwHana,
  });
  const apr = calcAprPct({
    hlNotionalUsd: hlSizeAbs * hlMarkUsd,
    fundingHourly,
    capitalUsd: capital,
  });
  const delta = calcDeltaMismatchPct({
    hlSizeAbs, hlMarkUsd,
    krQuantity: pair.krLeg.quantity, krCloseKrw, usdKrwHana,
  });
  const neutral = isDeltaNeutral(delta);

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-hl-bg-tertiary border-b border-hl-border">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-hl-text-primary">{krName}</span>
          <span className="text-xs text-hl-text-tertiary font-mono">
            {pair.hlSymbol} / {pair.krLeg.krCode}
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              neutral
                ? "bg-hl-green/15 text-hl-green"
                : "bg-hl-yellow/15 text-hl-yellow"
            }`}
          >
            {neutral ? "DELTA NEUTRAL ✓" : `Δ ${delta.toFixed(1)}% ⚠`}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-hl-text-tertiary">APR</span>
          <span className={`font-mono font-bold ${pnlColor(apr)}`}>
            {apr.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-hl-border">
        <div className="p-4">
          <div className="text-[10px] text-hl-text-tertiary mb-1 uppercase tracking-wider">
            HL Short
          </div>
          <div className="font-mono text-hl-text-primary font-semibold">
            ${hlMarkUsd.toFixed(2)}
          </div>
          <div className="text-[11px] text-hl-text-tertiary mt-1">
            Size {hlSizeAbs.toFixed(4)}
          </div>
          <div className="text-[11px] text-hl-green mt-1">
            Funding {(fundingHourly * 100).toFixed(4)}%/h
          </div>
        </div>
        <div className="p-4">
          <div className="text-[10px] text-hl-text-tertiary mb-1 uppercase tracking-wider">
            KR Spot
          </div>
          <div className="font-mono text-hl-text-primary font-semibold">
            ₩{krCloseKrw.toLocaleString("ko-KR")}
          </div>
          <div className="text-[11px] text-hl-text-tertiary mt-1">
            Avg ₩{pair.krLeg.avgPriceKrw.toLocaleString("ko-KR")} · Qty {pair.krLeg.quantity}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-3 bg-hl-bg-primary/40">
        <div className="flex gap-6 text-xs">
          <div>
            <div className="text-hl-text-tertiary text-[10px] uppercase">Premium</div>
            <div className={`font-mono font-bold ${pnlColor(premium)}`}>
              {premium >= 0 ? "+" : ""}{premium.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-hl-text-tertiary text-[10px] uppercase">Funding</div>
            <div className={`font-mono font-bold ${pnlColor(cumFundingUsd)}`}>
              {formatUsd(cumFundingUsd)}
            </div>
          </div>
          <div>
            <div className="text-hl-text-tertiary text-[10px] uppercase">Capital</div>
            <div className="font-mono font-bold text-hl-text-primary">
              {formatUsd(capital)}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="px-2 py-1 text-[11px] rounded border border-hl-border text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light"
          >
            Edit
          </button>
          <button
            onClick={onClose}
            className="px-2 py-1 text-[11px] rounded border border-hl-border text-hl-text-secondary hover:text-hl-red hover:border-hl-red/50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create PairEditModal**

Create `src/app/arb/PairEditModal.tsx`:
```tsx
"use client";
import { useState } from "react";
import type { KrLeg } from "@/lib/arbStore";
import { getTickerByHl } from "@/lib/tickerMap";

interface Props {
  hlAddress: string;
  hlSymbol: string;
  initial?: KrLeg;
  onSave: (leg: KrLeg) => void;
  onCancel: () => void;
}

export default function PairEditModal({ hlAddress, hlSymbol, initial, onSave, onCancel }: Props) {
  const suggested = getTickerByHl(hlSymbol);
  const [krCode, setKrCode] = useState(initial?.krCode ?? suggested?.krCode ?? "");
  const [krName, setKrName] = useState(initial?.krName ?? suggested?.krName ?? "");
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? ""));
  const [avgPrice, setAvgPrice] = useState(String(initial?.avgPriceKrw ?? ""));
  const [brokerLabel, setBrokerLabel] = useState(initial?.brokerLabel ?? "");

  const canSave =
    krCode.length > 0 &&
    krName.length > 0 &&
    parseFloat(quantity) > 0 &&
    parseFloat(avgPrice) > 0;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-hl-bg-secondary border border-hl-border rounded-xl p-6 w-full max-w-md space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-hl-text-primary">
            Pair {hlSymbol} with KR spot
          </h3>
          <p className="text-xs text-hl-text-tertiary mt-1 font-mono">
            wallet {hlAddress.slice(0, 6)}...{hlAddress.slice(-4)}
          </p>
        </div>
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs text-hl-text-tertiary mb-1">KR code</label>
            <input value={krCode} onChange={(e) => setKrCode(e.target.value)}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary" />
          </div>
          <div>
            <label className="block text-xs text-hl-text-tertiary mb-1">KR name</label>
            <input value={krName} onChange={(e) => setKrName(e.target.value)}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 text-hl-text-primary" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-hl-text-tertiary mb-1">Quantity (shares)</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary" />
            </div>
            <div>
              <label className="block text-xs text-hl-text-tertiary mb-1">Avg price (KRW)</label>
              <input type="number" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)}
                className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-hl-text-tertiary mb-1">Broker (optional)</label>
            <input value={brokerLabel} onChange={(e) => setBrokerLabel(e.target.value)}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 text-hl-text-primary" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onCancel}
            className="px-3 py-1.5 text-xs text-hl-text-secondary hover:text-hl-text-primary">
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={() =>
              onSave({
                krCode,
                krName,
                quantity: parseFloat(quantity),
                avgPriceKrw: parseFloat(avgPrice),
                entryTs: initial?.entryTs ?? Date.now(),
                brokerLabel: brokerLabel || undefined,
              })
            }
            className="px-4 py-1.5 text-xs font-semibold rounded bg-hl-accent text-hl-bg-primary disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create UnhedgedList**

Create `src/app/arb/UnhedgedList.tsx`:
```tsx
"use client";
import { getTickerByHl } from "@/lib/tickerMap";

export interface UnhedgedShort {
  hlAddress: string;
  hlSymbol: string;
  sizeAbs: number;
  markPx: number;
}

interface Props {
  shorts: UnhedgedShort[];
  onPairUp: (short: UnhedgedShort) => void;
}

export default function UnhedgedList({ shorts, onPairUp }: Props) {
  if (shorts.length === 0) return null;
  return (
    <div className="bg-hl-yellow/5 border border-hl-yellow/30 rounded-xl p-4 mb-4">
      <div className="text-xs font-semibold text-hl-yellow mb-2 uppercase tracking-wider">
        Unhedged HL shorts ({shorts.length})
      </div>
      <div className="space-y-2">
        {shorts.map((s) => {
          const mapped = getTickerByHl(s.hlSymbol);
          return (
            <div key={`${s.hlAddress}-${s.hlSymbol}`}
              className="flex items-center justify-between text-sm">
              <div>
                <span className="font-mono text-hl-text-primary">{s.hlSymbol}</span>
                <span className="text-xs text-hl-text-tertiary ml-2">
                  {s.sizeAbs.toFixed(4)} @ ${s.markPx.toFixed(2)}
                </span>
                {!mapped && (
                  <span className="ml-2 text-[10px] text-hl-red">
                    (no KR mapping — will need manual entry)
                  </span>
                )}
              </div>
              <button
                onClick={() => onPairUp(s)}
                className="px-2 py-1 text-[11px] rounded border border-hl-yellow/40 text-hl-yellow hover:bg-hl-yellow/10"
              >
                Pair up
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create LedgerPanel wiring everything together**

Create `src/app/arb/LedgerPanel.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import { useAddresses } from "@/lib/store";
import { useArbPairs } from "@/hooks/useArbPairs";
import { getClearinghouseState } from "@/lib/hyperliquid";
import { useEffect } from "react";
import LedgerCard from "./LedgerCard";
import UnhedgedList, { type UnhedgedShort } from "./UnhedgedList";
import PairEditModal from "./PairEditModal";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import type { ArbPair, KrLeg } from "@/lib/arbStore";

interface HlPositionSnap {
  hlAddress: string;
  hlSymbol: string;
  sizeAbs: number;
  cumFundingUsd: number;
}

async function fetchHlShortsForAddress(address: string): Promise<HlPositionSnap[]> {
  // Only HIP-3 xyz dex — pass dex arg
  const state = await getClearinghouseState(address, "xyz");
  const out: HlPositionSnap[] = [];
  for (const ap of state.assetPositions ?? []) {
    const p = ap.position;
    const size = parseFloat(p.szi);
    if (size >= 0) continue; // shorts only
    const rawSymbol = p.coin.includes(":") ? p.coin : `xyz:${p.coin}`;
    out.push({
      hlAddress: address,
      hlSymbol: rawSymbol,
      sizeAbs: Math.abs(size),
      cumFundingUsd: -parseFloat(p.cumFunding.sinceOpen), // received → positive for us
    });
  }
  return out;
}

interface Props {
  snapshot: LiveSnapshot | null;
}

export default function LedgerPanel({ snapshot }: Props) {
  const { addresses } = useAddresses();
  const { pairs, addPair, updatePair, closePair } = useArbPairs();
  const [hlShorts, setHlShorts] = useState<HlPositionSnap[]>([]);
  const [modalState, setModalState] = useState<
    | { mode: "create"; short: UnhedgedShort }
    | { mode: "edit"; pair: ArbPair }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        addresses.map((a) => fetchHlShortsForAddress(a.address).catch(() => []))
      );
      if (!cancelled) setHlShorts(results.flat());
    })();
    const interval = setInterval(async () => {
      const results = await Promise.all(
        addresses.map((a) => fetchHlShortsForAddress(a.address).catch(() => []))
      );
      if (!cancelled) setHlShorts(results.flat());
    }, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [addresses]);

  const activePairs = useMemo(() => pairs.filter((p) => !p.closedAt), [pairs]);
  const pairedKeys = useMemo(
    () => new Set(activePairs.map((p) => `${p.hlAddress.toLowerCase()}|${p.hlSymbol}`)),
    [activePairs]
  );
  const unhedged: UnhedgedShort[] = hlShorts
    .filter((s) => !pairedKeys.has(`${s.hlAddress.toLowerCase()}|${s.hlSymbol}`))
    .map((s) => ({
      hlAddress: s.hlAddress,
      hlSymbol: s.hlSymbol,
      sizeAbs: s.sizeAbs,
      markPx: snapshot?.hl[s.hlSymbol]?.markPx ?? 0,
    }));

  const handleSave = (leg: KrLeg) => {
    if (modalState?.mode === "create") {
      addPair({
        hlAddress: modalState.short.hlAddress,
        hlSymbol: modalState.short.hlSymbol,
        krLeg: leg,
      });
    } else if (modalState?.mode === "edit") {
      updatePair(modalState.pair.id, { krLeg: leg });
    }
    setModalState(null);
  };

  return (
    <div>
      <UnhedgedList
        shorts={unhedged}
        onPairUp={(s) => setModalState({ mode: "create", short: s })}
      />

      {activePairs.length === 0 && unhedged.length === 0 && (
        <div className="text-sm text-hl-text-tertiary p-6 text-center bg-hl-bg-secondary border border-hl-border rounded-xl">
          No arb pairs yet. Add a wallet with an HL xyz short in <b>Addresses</b>, then pair it here.
        </div>
      )}

      <div className="space-y-4">
        {activePairs.map((pair) => {
          const hl = snapshot?.hl[pair.hlSymbol];
          const kr = snapshot?.kr[pair.hlSymbol];
          const hlPos = hlShorts.find(
            (s) => s.hlAddress.toLowerCase() === pair.hlAddress.toLowerCase() && s.hlSymbol === pair.hlSymbol
          );
          if (!hl || !kr || !hlPos || snapshot?.fx.usdKrwHana == null || snapshot?.fx.usdtKrwUpbit == null) {
            return (
              <div key={pair.id} className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 text-xs text-hl-text-tertiary">
                {pair.hlSymbol} / {pair.krLeg.krCode} — waiting for live data…
              </div>
            );
          }
          return (
            <LedgerCard
              key={pair.id}
              pair={pair}
              hlSizeAbs={hlPos.sizeAbs}
              hlMarkUsd={hl.markPx}
              fundingHourly={hl.fundingHourly}
              cumFundingUsd={hlPos.cumFundingUsd}
              krCloseKrw={kr.close}
              usdKrwHana={snapshot.fx.usdKrwHana}
              usdtKrwUpbit={snapshot.fx.usdtKrwUpbit}
              krName={pair.krLeg.krName}
              onEdit={() => setModalState({ mode: "edit", pair })}
              onClose={() => closePair(pair.id)}
            />
          );
        })}
      </div>

      {modalState?.mode === "create" && (
        <PairEditModal
          hlAddress={modalState.short.hlAddress}
          hlSymbol={modalState.short.hlSymbol}
          onSave={handleSave}
          onCancel={() => setModalState(null)}
        />
      )}
      {modalState?.mode === "edit" && (
        <PairEditModal
          hlAddress={modalState.pair.hlAddress}
          hlSymbol={modalState.pair.hlSymbol}
          initial={modalState.pair.krLeg}
          onSave={handleSave}
          onCancel={() => setModalState(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire LedgerPanel into `/arb` page**

In `src/app/arb/page.tsx`, replace the ledger placeholder div with `<LedgerPanel snapshot={snapshot} />` and add `import LedgerPanel from "./LedgerPanel";` at the top.

- [ ] **Step 6: Manual verify**

`npm run dev`. On `/arb`:
- With a wallet holding an `xyz:*` short: unhedged list should show the position, "Pair up" opens the modal, saving creates a card with live premium/APR.
- Editing / closing works.

Stop dev server.

- [ ] **Step 7: Commit**

```powershell
git add src/app/arb/LedgerCard.tsx src/app/arb/UnhedgedList.tsx src/app/arb/PairEditModal.tsx src/app/arb/LedgerPanel.tsx src/app/arb/page.tsx
git commit -m "feat(arb): ledger panel with LedgerCard, UnhedgedList, PairEditModal"
```

---

## Task 17: Scanner panel

**Files:**
- Create: `src/app/arb/ScannerTable.tsx`
- Create: `src/app/arb/ScannerPanel.tsx`
- Modify: `src/app/arb/page.tsx`

- [ ] **Step 1: Create ScannerTable**

Create `src/app/arb/ScannerTable.tsx`:
```tsx
"use client";
import { useMemo, useState } from "react";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { loadTickerMap } from "@/lib/tickerMap";
import { calcPremiumPct, calcAprPct, calcCapitalUsd } from "@/lib/arb";
import { pnlColor } from "@/lib/format";

type SortKey = "apr" | "premium" | "funding";

interface Row {
  hlSymbol: string;
  krName: string;
  markPx: number;
  krCloseKrw: number;
  premiumPct: number;
  aprPct: number;
  fundingHourly: number;
}

interface Props {
  snapshot: LiveSnapshot;
}

const HIDE_BELOW_ABS_PREMIUM_PCT = 0.1;

export default function ScannerTable({ snapshot }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("apr");

  const rows = useMemo<Row[]>(() => {
    const map = loadTickerMap();
    const out: Row[] = [];
    for (const t of map) {
      const hl = snapshot.hl[t.hlSymbol];
      const kr = snapshot.kr[t.hlSymbol];
      if (!hl || !kr || snapshot.fx.usdKrwHana == null || snapshot.fx.usdtKrwUpbit == null) continue;
      const premium = calcPremiumPct({
        hlMarkUsd: hl.markPx, usdtKrw: snapshot.fx.usdtKrwUpbit, krCloseKrw: kr.close,
      });
      if (Math.abs(premium) < HIDE_BELOW_ABS_PREMIUM_PCT) continue;
      // Scanner assumes 1-unit notional and matching KR quantity to project APR
      const hlSizeAbs = 1;
      const krQuantity = (hl.markPx * snapshot.fx.usdKrwHana) / kr.close;
      const capital = calcCapitalUsd({
        hlSizeAbs, hlMarkUsd: hl.markPx,
        krQuantity, krAvgPriceKrw: kr.close, usdKrwHana: snapshot.fx.usdKrwHana,
      });
      const apr = calcAprPct({
        hlNotionalUsd: hl.markPx, fundingHourly: hl.fundingHourly, capitalUsd: capital,
      });
      out.push({
        hlSymbol: t.hlSymbol,
        krName: t.krName,
        markPx: hl.markPx,
        krCloseKrw: kr.close,
        premiumPct: premium,
        aprPct: apr,
        fundingHourly: hl.fundingHourly,
      });
    }
    return out.sort((a, b) => {
      if (sortKey === "apr") return b.aprPct - a.aprPct;
      if (sortKey === "premium") return b.premiumPct - a.premiumPct;
      return b.fundingHourly - a.fundingHourly;
    });
  }, [snapshot, sortKey]);

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-hl-border text-xs">
        <span className="text-hl-text-tertiary">Sort by</span>
        {(["apr", "premium", "funding"] as SortKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={`px-2 py-0.5 rounded font-mono uppercase ${
              sortKey === k
                ? "bg-hl-accent/20 text-hl-accent"
                : "text-hl-text-secondary hover:text-hl-text-primary"
            }`}
          >
            {k}
          </button>
        ))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-hl-text-tertiary uppercase tracking-wider">
            <th className="px-3 py-2 text-left">Pair</th>
            <th className="px-3 py-2 text-right">Mark</th>
            <th className="px-3 py-2 text-right">Spot</th>
            <th className="px-3 py-2 text-right">Prem</th>
            <th className="px-3 py-2 text-right">APR</th>
            <th className="px-3 py-2 text-right">1h Fund</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="p-6 text-center text-hl-text-tertiary text-xs">
              No mapped tickers with premium ≥ 0.1%.
            </td></tr>
          ) : rows.map((r) => (
            <tr key={r.hlSymbol} className="border-t border-hl-border/50 hover:bg-hl-bg-hover/50">
              <td className="px-3 py-2">
                <div className="font-semibold text-hl-text-primary">{r.hlSymbol.replace("xyz:", "")}</div>
                <div className="text-[10px] text-hl-text-tertiary">{r.krName}</div>
              </td>
              <td className="px-3 py-2 text-right font-mono text-hl-text-primary">${r.markPx.toFixed(2)}</td>
              <td className="px-3 py-2 text-right font-mono text-hl-text-primary">
                ₩{Math.round(r.krCloseKrw / 1000)}k
              </td>
              <td className={`px-3 py-2 text-right font-mono ${pnlColor(r.premiumPct)}`}>
                {r.premiumPct >= 0 ? "+" : ""}{r.premiumPct.toFixed(2)}%
              </td>
              <td className={`px-3 py-2 text-right font-mono font-bold ${pnlColor(r.aprPct)}`}>
                {r.aprPct.toFixed(1)}%
              </td>
              <td className={`px-3 py-2 text-right font-mono ${pnlColor(r.fundingHourly)}`}>
                {(r.fundingHourly * 100).toFixed(4)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Create ScannerPanel wrapper**

Create `src/app/arb/ScannerPanel.tsx`:
```tsx
"use client";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import ScannerTable from "./ScannerTable";

interface Props { snapshot: LiveSnapshot | null }

export default function ScannerPanel({ snapshot }: Props) {
  if (!snapshot) {
    return (
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-6 text-sm text-hl-text-tertiary">
        Loading…
      </div>
    );
  }
  return <ScannerTable snapshot={snapshot} />;
}
```

- [ ] **Step 3: Wire into page**

In `src/app/arb/page.tsx`, replace the scanner placeholder div with `<ScannerPanel snapshot={snapshot} />` and import `ScannerPanel from "./ScannerPanel"`.

- [ ] **Step 4: Manual verify**

`npm run dev`, visit `/arb`. Expected: right column shows a table of mapped tickers (SKHX, SMSN) with premium/APR/funding columns; sort buttons work.

- [ ] **Step 5: Commit**

```powershell
git add src/app/arb/ScannerTable.tsx src/app/arb/ScannerPanel.tsx src/app/arb/page.tsx
git commit -m "feat(arb): opportunity scanner table"
```

---

## Task 18: Summary strip

**Files:**
- Create: `src/app/arb/SummaryStrip.tsx`
- Modify: `src/app/arb/page.tsx`

- [ ] **Step 1: Create SummaryStrip**

Create `src/app/arb/SummaryStrip.tsx`:
```tsx
"use client";
import { useMemo } from "react";
import { useArbPairs } from "@/hooks/useArbPairs";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import { calcCapitalUsd, calcAprPct } from "@/lib/arb";
import { formatUsd, pnlColor } from "@/lib/format";
import StatCard from "@/components/StatCard";

interface Props {
  snapshot: LiveSnapshot | null;
  hlPositionsBySymbol: Record<string, { sizeAbs: number; cumFundingUsd: number }>;
}

export default function SummaryStrip({ snapshot, hlPositionsBySymbol }: Props) {
  const { pairs } = useArbPairs();

  const totals = useMemo(() => {
    if (!snapshot || snapshot.fx.usdKrwHana == null) {
      return { totalCapital: 0, blendedApr: 0, totalFunding: 0 };
    }
    let totalCapital = 0;
    let weightedApr = 0;
    let totalFunding = 0;
    for (const p of pairs) {
      if (p.closedAt) continue;
      const key = `${p.hlAddress.toLowerCase()}|${p.hlSymbol}`;
      const pos = hlPositionsBySymbol[key];
      const hl = snapshot.hl[p.hlSymbol];
      if (!pos || !hl) continue;
      const capital = calcCapitalUsd({
        hlSizeAbs: pos.sizeAbs,
        hlMarkUsd: hl.markPx,
        krQuantity: p.krLeg.quantity,
        krAvgPriceKrw: p.krLeg.avgPriceKrw,
        usdKrwHana: snapshot.fx.usdKrwHana!,
      });
      const apr = calcAprPct({
        hlNotionalUsd: pos.sizeAbs * hl.markPx,
        fundingHourly: hl.fundingHourly,
        capitalUsd: capital,
      });
      totalCapital += capital;
      weightedApr += apr * capital;
      totalFunding += pos.cumFundingUsd;
    }
    return {
      totalCapital,
      blendedApr: totalCapital > 0 ? weightedApr / totalCapital : 0,
      totalFunding,
    };
  }, [pairs, snapshot, hlPositionsBySymbol]);

  const usdtPrem =
    snapshot?.fx.usdtKrwUpbit != null && snapshot?.fx.usdKrwHana != null
      ? ((snapshot.fx.usdtKrwUpbit - snapshot.fx.usdKrwHana) / snapshot.fx.usdKrwHana) * 100
      : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      <StatCard title="Total Funding" value={formatUsd(totals.totalFunding)}
        subtitle="Realized since open" loading={!snapshot} />
      <StatCard title="Blended APR" value={`${totals.blendedApr.toFixed(1)}%`}
        subtitle="Weighted by capital" loading={!snapshot} />
      <StatCard title="Capital Deployed" value={formatUsd(totals.totalCapital)}
        subtitle="HL notional + KR spot" loading={!snapshot} />
      <StatCard title="USDT 김프"
        value={usdtPrem != null ? `${usdtPrem >= 0 ? "+" : ""}${usdtPrem.toFixed(2)}%` : "—"}
        subtitle="Upbit vs 하나은행" loading={!snapshot} />
    </div>
  );
}
```

- [ ] **Step 2: Hoist HL position data**

`LedgerPanel` currently owns HL positions state. Extract that fetch into a small hook so `SummaryStrip` can share it. Create `src/app/arb/useHlXyzShorts.ts`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { useAddresses } from "@/lib/store";
import { getClearinghouseState } from "@/lib/hyperliquid";

export interface HlShortSnap {
  hlAddress: string;
  hlSymbol: string;
  sizeAbs: number;
  cumFundingUsd: number;
}

async function fetchForAddress(address: string): Promise<HlShortSnap[]> {
  const state = await getClearinghouseState(address, "xyz");
  const out: HlShortSnap[] = [];
  for (const ap of state.assetPositions ?? []) {
    const p = ap.position;
    const size = parseFloat(p.szi);
    if (size >= 0) continue;
    const rawSymbol = p.coin.includes(":") ? p.coin : `xyz:${p.coin}`;
    out.push({
      hlAddress: address,
      hlSymbol: rawSymbol,
      sizeAbs: Math.abs(size),
      cumFundingUsd: -parseFloat(p.cumFunding.sinceOpen),
    });
  }
  return out;
}

export function useHlXyzShorts() {
  const { addresses } = useAddresses();
  const [shorts, setShorts] = useState<HlShortSnap[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const results = await Promise.all(
        addresses.map((a) => fetchForAddress(a.address).catch(() => []))
      );
      if (!cancelled) setShorts(results.flat());
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [addresses]);

  return shorts;
}
```

- [ ] **Step 3: Refactor LedgerPanel to use the hook**

In `src/app/arb/LedgerPanel.tsx`:
1. Remove the local `HlPositionSnap` interface, the `fetchHlShortsForAddress` function, the `hlShorts` state, and the `useEffect` that fetches shorts.
2. Add `import { useHlXyzShorts, type HlShortSnap } from "./useHlXyzShorts";` at the top.
3. Replace `const [hlShorts, setHlShorts] = useState<HlPositionSnap[]>([]);` and its effect with `const hlShorts = useHlXyzShorts();`.
4. Rename type references from `HlPositionSnap` to `HlShortSnap`.

- [ ] **Step 4: Wire SummaryStrip into page**

Update `src/app/arb/page.tsx`:
```tsx
"use client";
import { useMemo } from "react";
import { useLiveSnapshot } from "./useLiveSnapshot";
import { useHlXyzShorts } from "./useHlXyzShorts";
import LedgerPanel from "./LedgerPanel";
import ScannerPanel from "./ScannerPanel";
import SummaryStrip from "./SummaryStrip";

export default function ArbPage() {
  const { snapshot, error } = useLiveSnapshot();
  const shorts = useHlXyzShorts();

  const shortsByKey = useMemo(() => {
    const m: Record<string, { sizeAbs: number; cumFundingUsd: number }> = {};
    for (const s of shorts) {
      m[`${s.hlAddress.toLowerCase()}|${s.hlSymbol}`] = {
        sizeAbs: s.sizeAbs,
        cumFundingUsd: s.cumFundingUsd,
      };
    }
    return m;
  }, [shorts]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">
            Funding Arbitrage
          </h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            Hyperliquid × KRX 델타 헤지 원장
          </p>
        </div>
        {snapshot && (
          <div className="text-xs text-hl-text-tertiary font-mono">
            USDT/KRW {snapshot.fx.usdtKrwUpbit?.toFixed(2) ?? "—"} · USD/KRW{" "}
            {snapshot.fx.usdKrwHana?.toFixed(2) ?? "—"}
          </div>
        )}
      </div>

      {error && (
        <div className="bg-hl-red/10 border border-hl-red/30 text-hl-red text-sm p-3 rounded-lg">
          Aggregator error: {error}
        </div>
      )}
      {snapshot && snapshot.warnings.length > 0 && (
        <div className="bg-hl-yellow/10 border border-hl-yellow/30 text-hl-yellow text-xs p-2 rounded-lg font-mono">
          Warnings: {snapshot.warnings.join(", ")}
        </div>
      )}

      <SummaryStrip snapshot={snapshot} hlPositionsBySymbol={shortsByKey} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-lg font-semibold text-hl-text-primary mb-4">My Ledger</h2>
          <LedgerPanel snapshot={snapshot} />
        </section>
        <section>
          <h2 className="text-lg font-semibold text-hl-text-primary mb-4">Opportunity Scanner</h2>
          <ScannerPanel snapshot={snapshot} />
        </section>
      </div>
    </div>
  );
}
```

Then update `LedgerPanel` prop signature to accept the shorts array from the parent (pass `shorts={shorts}` instead of fetching internally). Adjust `LedgerPanel.tsx`:

```typescript
// Replace `const hlShorts = useHlXyzShorts();` with a prop:
interface Props { snapshot: LiveSnapshot | null; shorts: HlShortSnap[] }
export default function LedgerPanel({ snapshot, shorts }: Props) {
  // ...replace all `hlShorts` references with `shorts`...
}
```

And in `page.tsx`, pass `<LedgerPanel snapshot={snapshot} shorts={shorts} />`.

- [ ] **Step 5: Manual verify**

`npm run dev`. Expected: summary strip shows 4 stat cards populated by pair math; blended APR aligns with individual card APRs (weighted).

- [ ] **Step 6: Commit**

```powershell
git add src/app/arb/SummaryStrip.tsx src/app/arb/useHlXyzShorts.ts src/app/arb/LedgerPanel.tsx src/app/arb/page.tsx
git commit -m "feat(arb): summary strip and shared HL shorts hook"
```

---

## Task 19: End-to-end smoke test

**Files:**
- (none new; documenting a manual verification pass)

- [ ] **Step 1: Ensure test suite is green**

Run: `npm test`
Expected: all tests passing, no failures.

- [ ] **Step 2: Build production bundle**

Run: `npm run build`
Expected: builds without TypeScript errors.

- [ ] **Step 3: Smoke test the full flow**

`npm run dev`, then:
- [ ] Visit `/arb` → page loads, no console errors
- [ ] Summary strip renders (may show `—` for capital if no pairs)
- [ ] Scanner shows at least one row for SKHX or SMSN (if xyz dex is live)
- [ ] Go to `/address` → add a wallet that holds an `xyz:*` short
- [ ] Return to `/arb` → wallet's short appears in "Unhedged HL shorts"
- [ ] Click "Pair up" → modal opens with suggested KR code from tickerMap
- [ ] Enter quantity + avg price, save → LedgerCard renders with live premium, APR, delta badge
- [ ] Edit and Close both work; closed pair disappears from the ledger view
- [ ] Aggregator warnings surface as yellow banner if any upstream fails

- [ ] **Step 4: Commit any smoke-test fixups + tag**

If fixes were needed:
```powershell
git add -A
git commit -m "fix: smoke test issues"
```

Tag the MVP:
```powershell
git tag -a arb-mvp -m "Arb tracker MVP: ledger + scanner + aggregator"
```

---

## Task 20: Deploy check

- [ ] **Step 1: Verify `vercel.json` covers new route**

Read `vercel.json` and confirm `/api/aggregator` is not blocked by any function config. If Vercel needs `runtime: "nodejs"` for `fetch`+scraping, add:
```json
{ "functions": { "src/app/api/aggregator/route.ts": { "maxDuration": 15 } } }
```

- [ ] **Step 2: Push branch and open a preview**

```powershell
git push origin HEAD
```

Then in Vercel dashboard, open the branch preview URL, exercise `/arb`, watch the Vercel function logs for scraper failures.

- [ ] **Step 3: Commit any deploy config changes**

```powershell
git add vercel.json
git commit -m "chore: bump aggregator function timeout for scraping"
git push
```

---

## Self-Review Checklist (reviewer's use)

- [x] Every spec section has a corresponding task (types → T2/T3; aggregator → T7-T12; calc → T4-T6; UI → T13-T18; testing → T4-T10 + T19)
- [x] No placeholders (no TBD / TODO / "similar to")
- [x] Type names match across tasks: `LiveSnapshot`, `HlAssetCtx`, `KrQuote`, `ArbPair`, `KrLeg`, `TickerMapEntry`, `HlShortSnap`
- [x] Function signatures consistent: `calcPremiumPct` / `calcCapitalUsd` / `calcAprPct` / `calcDeltaMismatchPct` used identically in tests, components, summary
- [x] TDD pattern for math + providers; UI verified manually per task
- [x] Frequent commits — one per task (20 commits total)
- [x] Windows PowerShell commands throughout
