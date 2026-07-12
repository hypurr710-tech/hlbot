# Hypurr Funding Arbitrage Tracker — Design Spec

**Date**: 2026-07-12
**Status**: Draft (pending user review)
**Base project**: `hlbot` (existing hypurr-tracker at hypurr-tracker.vercel.app)

## 1. Purpose

A hybrid dashboard for tracking Hyperliquid stock-perp × Korean-spot funding arbitrage. Combines a **personal ledger** (positions the user actually holds) with an **opportunity scanner** (perps ranked by attractiveness for a new arb entry). Designed to be forward-compatible with an execution bot in a later phase.

**Arb mechanism**:
1. Short a Korean-stock perp on Hyperliquid HIP-3 dex `xyz` (e.g. `xyz:SKHX` = SK하이닉스, `xyz:SMSN` = 삼성전자) at 1x leverage
2. Buy the underlying stock (e.g. KRX 000660) in a Korean brokerage — delta-neutral
3. Collect hourly funding while premium remains positive
4. Optionally close both legs when premium narrows

## 2. Scope

### In scope (MVP)
- Korean-stock perps on Hyperliquid `xyz` dex only
- Manual Korean-brokerage side entry (no broker API in MVP)
- Real-time data via own aggregator (no third-party price API)
- Client-side storage (localStorage)
- Read-only tracker + scanner (no order execution)

### Out of scope (MVP, planned for later phases)
- Coin kimchi premium arb (BTC/ETH)
- US-stock perps
- Order execution / bot automation
- Multi-device sync / cloud storage
- Historical funding backfill beyond what Hyperliquid API exposes

### Non-goals
- Detection of positions in the Korean brokerage account (no broker integration in MVP; user enters manually)
- Sub-second price updates (5-10s polling is sufficient)

## 3. Data Model

### 3.1 Types

```typescript
// Wallet with Hyperliquid positions (reuse hlbot's TrackedAddress)
interface TrackedAddress {
  address: string;    // 0x...
  label?: string;
}

// Korean-side leg of an arbitrage pair (user-entered)
interface KrLeg {
  krCode: string;         // "000660"
  krName: string;         // "SK하이닉스"
  quantity: number;       // shares
  avgPriceKrw: number;    // average buy price
  entryTs: number;        // ms epoch
  brokerLabel?: string;   // "삼성증권" (optional, informational)
}

// Arb pair links an HL perp position to a KR spot leg
interface ArbPair {
  id: string;             // uuid
  hlAddress: string;      // which wallet holds the short
  hlSymbol: string;       // "xyz:SKHX"
  krLeg: KrLeg;
  createdAt: number;
  closedAt?: number;      // set when user marks closed
  note?: string;
}

// Ticker registry — maps HL symbol to KR stock metadata
interface TickerMap {
  hlSymbol: string;       // "xyz:SKHX"
  krCode: string;         // "000660"
  krName: string;         // "SK하이닉스"
  market: "KOSPI" | "KOSDAQ";
}

// Live snapshot from aggregator
interface LiveSnapshot {
  ts: number;
  fx: {
    usdKrwHana: number;    // fiat spot rate
    usdtKrwUpbit: number;  // crypto rate (김프 계산용)
  };
  hl: Record<string, {
    markPx: number;
    midPx: number;
    fundingHourly: number;   // e.g. 0.0000550288 = 0.005503%/h
    premium: number;         // HL's internal (perp vs oracle)
    openInterest: number;
    dayVolume: number;
  }>;
  kr: Record<string, {
    close: number;           // KRW
    prevClose: number;
    nxtPrice?: number;       // 시간외
    nxtSession?: "PRE" | "AFTER_MARKET" | null;
    marketOpen: boolean;
  }>;
}
```

### 3.2 Persistence

All in `localStorage`:
- `hypurr_addresses` — reused from hlbot's existing storage key
- `hypurr_arb_pairs` — array of `ArbPair`
- `hypurr_ticker_map_overrides` — user-added `TickerMap` entries only

Base `TickerMap` (SKHX/SMSN and whatever is live on `xyz` dex at build time) is shipped as a static JSON in the repo. User-added entries are merged on top from localStorage. This lets the seed list evolve without users losing their custom mappings.

**Security note**: No API keys, wallet keys, or brokerage credentials ever touch client storage. When the bot phase adds execution, secrets move exclusively to backend env vars and the client never sees them.

## 4. Data Aggregator

A single Next.js API route `/api/aggregator` returns a `LiveSnapshot`. Client polls every 5s. Each upstream is fetched in parallel with individual timeouts; partial failure returns a snapshot with `null` for the failed field rather than the whole endpoint erroring.

### 4.1 Upstream sources

| Field | Source | Method | Cache TTL |
|---|---|---|---|
| `hl.*` | Hyperliquid `info` API | `metaAndAssetCtxs` for `xyz` dex only (single call returns all markets on that dex) | 5s |
| `fx.usdtKrwUpbit` | Upbit public API | `GET api.upbit.com/v1/ticker?markets=KRW-USDT` | 5s |
| `fx.usdKrwHana` | NAVER 금융 환율 | Scrape `finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW` | 30s |
| `kr[code].close`, `prevClose` | NAVER 종목 페이지 | Scrape `finance.naver.com/item/main.naver?code=<code>` | 5s (market hours) / 60s (closed) |
| `kr[code].nxtPrice` | NAVER 시간외 | Scrape 시간외 페이지 | 5s during 시간외 session |

### 4.2 Scraping safeguards
- Browser-like User-Agent header
- Server-side only (Next.js API route) — never from browser
- 5-10s per-source cache in the aggregator to reduce upstream load
- Retry with exponential backoff on transient failures
- On repeated failure of one source, return `null` for that field with a `warnings[]` array in the response — UI shows a small yellow badge on that field

### 4.3 Adapter interface (bot forward-compat)

```typescript
interface KrSpotProvider {
  getQuote(krCode: string): Promise<{ close: number; prevClose: number; nxtPrice?: number }>;
}
```

MVP implements `NaverSpotProvider`. Bot phase adds `KisSpotProvider` (한국투자증권 Open API) with same interface; swap by env flag. Same pattern for `FxProvider`.

## 5. Calculations

All math done client-side from `LiveSnapshot` + `ArbPair` data. Pure functions in `src/lib/arb.ts` — testable in isolation.

### 5.1 Premium (김프 ON basis)

```
hlPriceKrw = hl.markPx × fx.usdtKrwUpbit
premiumPct = (hlPriceKrw − kr.close) / kr.close × 100
```

Positive premium = HL perp is more expensive than KRX spot → shorts get paid. This is the "opportunity" signal.

### 5.2 Investment base (per pair)

```
hlNotionalUsd = hlSize × hl.markPx        // 1x short: notional == margin
krCostKrw     = krLeg.quantity × krLeg.avgPriceKrw
krCostUsd     = krCostKrw / fx.usdKrwHana

capitalUsd = hlNotionalUsd + krCostUsd     // real out-of-pocket
```

### 5.3 APR (annualized funding at current rate)

Hyperliquid publishes hourly funding rates. Rate is a fraction of notional per hour:

```
fundingPerHourUsd = hlNotionalUsd × hl.fundingHourly
aprPct = (fundingPerHourUsd × 24 × 365) / capitalUsd × 100
```

**Note on sign**: `fundingHourly` from HL is positive when longs pay shorts. Since user is short, positive → we receive → APR positive.

### 5.4 Cumulative funding (per pair)

Hyperliquid `clearinghouseState` returns `cumFunding.sinceOpen` per position. This is the source of truth for realized funding. Displayed as USD figure and re-annualized as "realized APR since open".

### 5.5 Delta neutrality check

```
hlNotionalUsd = |hlSize| × hl.markPx
krCostUsdNow  = krLeg.quantity × kr.close / fx.usdKrwHana
deltaMismatch = (hlNotionalUsd − krCostUsdNow) / krCostUsdNow × 100
```

`|deltaMismatch| < 3%` → show "DELTA NEUTRAL ✓" badge, else "IMBALANCED ⚠".

### 5.6 Scanner ranking

Scanner shows only `xyz:*` symbols that have a `TickerMap` entry (i.e. a mapped KR code). Unmapped symbols are hidden — arb requires a KR side to exist. Default: sort by projected APR descending. Alternate sort options: current premium %, 24h avg funding (from HL `fundingHistory` endpoint).

## 6. UI Layout

Extends existing hlbot Next.js 16 + Tailwind + Recharts. Reuses `hl-*` color tokens and `Sidebar` navigation.

### 6.1 Sidebar (existing + additions)

```
Dashboard          (existing hlbot overview)
Arb               ← new (single combined route /arb)
Addresses          (existing)
```

The new arb site lives at `/arb` as a single split-view page. Ledger and Scanner are not separate routes — they are two panels of the same page. This matches the "arb decision needs both views simultaneously" principle from the brainstorm.

### 6.2 Primary route `/arb`

**Desktop**: Split view — Ledger (left half) + Scanner (right half).
**Mobile**: Stacked — summary → ledger → scanner.

Top row (both breakpoints): summary strip
- Total funding received (30d)
- Blended APR (all pairs weighted by capital)
- Total capital deployed (USD)
- USDT/KRW premium (김프)

### 6.3 Ledger section (left panel)

Each active `ArbPair` rendered as a **left-right panel card** (Option A from mockup):

```
┌────────────────────────────────────────────────┐
│ SK하이닉스              APR 21.3%              │
│ SKHX / 000660                                  │
├────────────────────┬───────────────────────────┤
│ HL SHORT · 1x      │ KR SPOT · 1주             │
│ $1,474.85          │ ₩2,180,000                │
│ Entry $1,468       │ Avg ₩2,170,000            │
│ Funding +0.0055%/h │ NXT ₩2,201,000            │
├────────────────────┴───────────────────────────┤
│ PREMIUM +1.28%   FUNDING +$127.4   CAP $3,150  │
└────────────────────────────────────────────────┘
```

Sub-elements:
- "Delta neutral ✓" or "Imbalanced ⚠" badge
- Actions: `Edit KR leg`, `Close pair` (marks `closedAt`, moves to history)
- Unhedged HL shorts (positions with no matching `ArbPair`) shown at the top of the ledger with a "Pair up" CTA

### 6.4 Scanner section (right panel)

Compact table (Option B from mockup):

```
PAIR      MARK      SPOT       PREM    APR    24H FUND
SKHX      $1,474    ₩2.18M    +1.28%  21.3%  +0.53%
SMSN      $190.6    ₩285k     +0.94%  16.7%  +0.42%
...
```

Row click → detail modal with 24h funding history sparkline (Recharts).

Sort selector: APR ↓ (default) | Premium ↓ | Funding 24h ↓.

Filter: hide symbols with `|premium| < 0.1%`.

### 6.5 Pair creation flow

From an unhedged HL short → "Pair up" → modal:
1. Auto-detect suggested KR code from `TickerMap[hlSymbol]`
2. Input: quantity, avg price KRW, entry timestamp (defaults to first HL fill time)
3. Optional: broker label, note
4. Save → new `ArbPair` in localStorage

## 7. Component Map

New under `src/`:

```
lib/
  arb.ts                    // pure calculations (premium, APR, capital, delta)
  aggregator/
    index.ts                // client fetcher + type
    providers/
      naverSpot.ts          // KR spot scraper
      naverFx.ts            // USD/KRW scraper
      upbitFx.ts            // USDT/KRW
      hlPerps.ts            // wraps hlbot's hyperliquid.ts for xyz dex
  arbStore.ts               // ArbPair CRUD in localStorage
  tickerMap.ts              // HL <-> KR code mapping, seeded

app/
  api/aggregator/route.ts   // GET returns LiveSnapshot
  arb/
    page.tsx                // main split view
    ledger/
      LedgerCard.tsx        // left-right panel card
      UnhedgedList.tsx
      PairEditModal.tsx
    scanner/
      ScannerTable.tsx
      DetailModal.tsx       // 24h funding sparkline

components/
  KimpBadge.tsx             // reusable USDT premium display
```

## 8. Error Handling

- **Aggregator upstream failure**: return snapshot with `null` for the failed field + `warnings` array. UI badges the missing value; other data still updates.
- **HL rate limit (429)**: existing hlbot rate limiter handles it. Aggregator API route uses same `postInfo` wrapper.
- **NAVER scrape structure change**: log to `warnings`, show placeholder in UI; retry next poll cycle.
- **User enters KR leg for wrong ticker**: no validation against a KR API (out of scope). Show delta check as the correctness indicator.
- **Bad user input** (negative qty, zero price): form-level Zod validation before write.

## 9. Testing

- **`lib/arb.ts` pure functions**: unit tests with fixture snapshots for premium, APR, delta, capital. Include edge cases (zero funding, negative premium, market closed).
- **Aggregator API route**: integration test hitting a mocked HTTP layer with recorded fixtures from real NAVER/Upbit/HL responses. Confirms partial-failure semantics.
- **UI**: manual smoke test — add a fake pair, verify numbers match hand-calculated values from a known snapshot.

TDD approach for `lib/arb.ts`; UI is exploratory.

## 10. Rollout / Migration

- MVP builds inside existing `hlbot` repo as a new `/arb` route
- Existing hypurr-tracker features unchanged
- After MVP: separate Vercel deployment if desired (rename or subdomain)
- Bot phase (separate spec): backend service reading same `arbStore` schema, using the same `KrSpotProvider` interface but swapped to `KisSpotProvider` for execution

## 11. Open Questions

*(none blocking — all resolved during brainstorming)*

Future decisions deferred to bot-phase spec:
- Which broker API (KIS vs 키움)
- Backend host (Vercel serverless vs VPS)
- Alerting channel (Telegram vs push)
