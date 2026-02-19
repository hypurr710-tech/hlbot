const API_URL = "https://api.hyperliquid.xyz/info";

// ---------------------------------------------------------------------------
// Weight-based rate limiter (Hyperliquid allows 1200 weight per minute)
// ---------------------------------------------------------------------------
const WEIGHT_LIMIT = 1100; // leave 100 buffer below the 1200 hard cap
const WEIGHT_WINDOW_MS = 60_000;

const LIGHT_WEIGHT_TYPES = new Set([
  "clearinghouseState",
  "allMids",
  "l2Book",
  "orderStatus",
  "spotClearinghouseState",
  "exchangeStatus",
]);

function getWeight(type: unknown): number {
  return LIGHT_WEIGHT_TYPES.has(type as string) ? 2 : 20;
}

const weightLog: { weight: number; ts: number }[] = [];

function consumedWeight(): number {
  const cutoff = Date.now() - WEIGHT_WINDOW_MS;
  while (weightLog.length > 0 && weightLog[0].ts < cutoff) weightLog.shift();
  return weightLog.reduce((s, e) => s + e.weight, 0);
}

async function waitForBudget(weight: number): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const used = consumedWeight();
    if (used + weight <= WEIGHT_LIMIT) {
      weightLog.push({ weight, ts: Date.now() });
      return;
    }
    // wait until the oldest entry expires
    const oldest = weightLog.length > 0 ? weightLog[0].ts : Date.now();
    const waitMs = Math.max(200, oldest + WEIGHT_WINDOW_MS - Date.now() + 50);
    console.warn(
      `[hlbot] rate-limiter: used ${used}/${WEIGHT_LIMIT} weight, waiting ${waitMs}ms`
    );
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 5000)));
  }
}

// ---------------------------------------------------------------------------

export interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B";
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
  builderFee?: string;
}

export interface Position {
  coin: string;
  entryPx: string | null;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
  marginUsed: string;
  maxLeverage: number;
  positionValue: string;
  returnOnEquity: string;
  spikeValue?: string;
  szi: string;
  unrealizedPnl: string;
  cumFunding: {
    allTime: string;
    sinceChange: string;
    sinceOpen: string;
  };
}

export interface ClearinghouseState {
  assetPositions: {
    position: Position;
    type: string;
  }[];
  crossMaintenanceMarginUsed: string;
  crossMarginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  withdrawable: string;
}

export interface AddressStats {
  address: string;
  totalVolume: number;
  totalFees: number;
  totalBuilderFees: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalTrades: number;
  accountValue: number;
  positions: Position[];
  fundingPnl: number;
}

async function postInfo(body: Record<string, unknown>, timeoutMs = 15000): Promise<unknown> {
  // Acquire rate-limit budget before sending the request
  await waitForBudget(getWeight(body.type));

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 429) {
        clearTimeout(timer);
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          console.warn(`[hlbot] 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, body.type);
          await new Promise((r) => setTimeout(r, delay));
          await waitForBudget(getWeight(body.type)); // re-acquire budget
          continue;
        }
        throw new Error(`API rate limited (429) after ${maxRetries} retries`);
      }
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`API timeout after ${timeoutMs}ms`);
      }
      if (attempt < maxRetries && err instanceof Error && err.message.includes("429")) {
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function getUserFills(
  user: string,
  startTime?: number,
  endTime?: number
): Promise<Fill[]> {
  if (startTime !== undefined) {
    const body: Record<string, unknown> = {
      type: "userFillsByTime",
      user,
      startTime,
      aggregateByTime: false,
    };
    if (endTime !== undefined) body.endTime = endTime;
    return (await postInfo(body)) as Fill[];
  }
  return (await postInfo({ type: "userFills", user })) as Fill[];
}

const FILLS_PAGE_LIMIT = 2000;

/** Fetch fills with pagination. maxPages controls how deep to go. */
export async function getAllUserFills(
  user: string,
  startTime: number,
  endTime?: number,
  maxPages = 5
): Promise<Fill[]> {
  const allFills: Fill[] = [];
  let currentStart = startTime;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(500); // Rate limit protection between pages
    const fills = await getUserFills(user, currentStart, endTime);
    if (fills.length === 0) break;

    allFills.push(...fills);

    if (fills.length < FILLS_PAGE_LIMIT) break;

    const lastTime = fills[fills.length - 1].time;
    currentStart = lastTime + 1;
  }

  return allFills;
}

/** Lightweight stats: only positions + clearinghouse (no fill pagination) */
export async function getAddressStatsLight(address: string): Promise<AddressStats> {
  const clearinghouse = await getClearinghouseState(address);

  let unrealizedPnl = 0;
  const positions: Position[] = [];
  for (const ap of clearinghouse.assetPositions) {
    if (parseFloat(ap.position.szi) !== 0) {
      positions.push(ap.position);
      unrealizedPnl += parseFloat(ap.position.unrealizedPnl);
    }
  }

  return {
    address,
    totalVolume: 0,
    totalFees: 0,
    totalBuilderFees: 0,
    realizedPnl: 0,
    unrealizedPnl,
    totalTrades: 0,
    accountValue: parseFloat(clearinghouse.crossMarginSummary.accountValue),
    positions,
    fundingPnl: 0,
  };
}

export async function getClearinghouseState(
  user: string,
  dex?: string
): Promise<ClearinghouseState> {
  const body: Record<string, unknown> = { type: "clearinghouseState", user };
  if (dex !== undefined) body.dex = dex;
  return (await postInfo(body)) as ClearinghouseState;
}

/**
 * Get positions across all dexes (standard perps + HIP-3 dexes).
 * First fetches recent fills to discover which HIP-3 dexes the user trades on,
 * then queries clearinghouseState for each dex.
 */
export async function getAllPositions(
  user: string
): Promise<Position[]> {
  // Step 1: Get recent fills to discover HIP-3 dex names
  const recentFills = await getUserFills(user);
  const dexNames = new Set<string>();
  for (const fill of recentFills) {
    const colonIdx = fill.coin.indexOf(":");
    if (colonIdx > 0) {
      dexNames.add(fill.coin.substring(0, colonIdx));
    }
  }

  // Step 2: Query clearinghouseState for default dex + each HIP-3 dex
  const dexesToQuery = ["", ...dexNames]; // "" = standard perps
  const results = await Promise.allSettled(
    dexesToQuery.map(async (dex) => {
      await sleep(dex === "" ? 0 : 200); // Stagger HIP-3 dex queries
      const state = await getClearinghouseState(user, dex);
      if (!state.assetPositions || !Array.isArray(state.assetPositions)) {
        return [];
      }
      return state.assetPositions
        .filter((ap) => {
          const pos = ap.position || ap;
          return pos.szi && parseFloat(pos.szi) !== 0;
        })
        .map((ap) => {
          const pos = ap.position || ap;
          // For HIP-3, coin might not have prefix in response; add it
          if (dex && pos.coin && !pos.coin.includes(":")) {
            pos.coin = `${dex}:${pos.coin}`;
          }
          return pos;
        });
    })
  );

  const allPositions: Position[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") {
      allPositions.push(...r.value);
    } else {
      console.error(`[hlbot] Failed to fetch positions for dex:`, r.reason);
    }
  }
  return allPositions;
}

export interface PortfolioPeriodData {
  accountValueHistory: [number, string][];
  pnlHistory: [number, string][];
  vlm: string;
}

export type PortfolioTimeRange = "day" | "week" | "month" | "allTime";

export async function getPortfolioHistory(
  user: string
): Promise<Record<PortfolioTimeRange, PortfolioPeriodData>> {
  const data = (await postInfo({ type: "portfolio", user })) as [
    string,
    PortfolioPeriodData
  ][];
  const result: Record<string, PortfolioPeriodData> = {};
  for (const [period, periodData] of data) {
    result[period] = periodData;
  }
  return result as Record<PortfolioTimeRange, PortfolioPeriodData>;
}

// Hyperliquid launch: ~late 2022. Use Jan 1 2023 as safe all-time start.
const ALL_TIME_START = 1672531200000;

/** Fetch current mid prices for all assets */
export async function getAllMids(): Promise<Record<string, string>> {
  return (await postInfo({ type: "allMids" })) as Record<string, string>;
}

export async function getAddressStats(address: string): Promise<AddressStats> {
  const [fills, clearinghouse] = await Promise.all([
    getAllUserFills(address, ALL_TIME_START, undefined, 10),
    getClearinghouseState(address),
  ]);

  let totalVolume = 0;
  let totalFees = 0;
  let totalBuilderFees = 0;
  let realizedPnl = 0;

  for (const fill of fills) {
    const notional = parseFloat(fill.px) * parseFloat(fill.sz);
    totalVolume += notional;
    totalFees += parseFloat(fill.fee);
    totalBuilderFees += parseFloat(fill.builderFee || "0");
    realizedPnl += parseFloat(fill.closedPnl);
  }

  let unrealizedPnl = 0;
  const positions: Position[] = [];
  for (const ap of clearinghouse.assetPositions) {
    if (parseFloat(ap.position.szi) !== 0) {
      positions.push(ap.position);
      unrealizedPnl += parseFloat(ap.position.unrealizedPnl);
    }
  }

  return {
    address,
    totalVolume,
    totalFees,
    totalBuilderFees,
    realizedPnl,
    unrealizedPnl,
    totalTrades: fills.length,
    accountValue: parseFloat(clearinghouse.crossMarginSummary.accountValue),
    positions,
    fundingPnl: 0,
  };
}
