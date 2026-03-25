import { CONFIG } from "./config";
import { getWeight, waitForBudget, onRateLimited } from "./rate-limiter";
import type {
  Fill,
  Position,
  ClearinghouseState,
  AddressStats,
  PortfolioPeriodData,
  PortfolioTimeRange,
} from "./types";

// Re-export types for backward compatibility
export type {
  Fill,
  Position,
  ClearinghouseState,
  AddressStats,
  PortfolioPeriodData,
  PortfolioTimeRange,
};

// ---------------------------------------------------------------------------
// Core API helper
// ---------------------------------------------------------------------------

async function postInfo(body: Record<string, unknown>, timeoutMs = CONFIG.api.timeoutMs): Promise<unknown> {
  await waitForBudget(getWeight(body.type));

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(CONFIG.api.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 429) {
        clearTimeout(timer);
        onRateLimited();
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          console.warn(`[hlbot] 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, body.type);
          await new Promise((r) => setTimeout(r, delay));
          await waitForBudget(getWeight(body.type));
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

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

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

/** Fetch fills with pagination. maxPages controls how deep to go. */
export async function getAllUserFills(
  user: string,
  startTime: number,
  endTime?: number,
  maxPages = CONFIG.pagination.maxPages
): Promise<Fill[]> {
  const allFills: Fill[] = [];
  let currentStart = startTime;

  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(CONFIG.timing.fillPageDelayMs);
    const fills = await getUserFills(user, currentStart, endTime);
    if (fills.length === 0) break;

    allFills.push(...fills);

    if (fills.length < CONFIG.pagination.fillsPageLimit) break;

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
 * Discovers HIP-3 dexes from recent fills, then queries each dex.
 */
export async function getAllPositions(
  user: string
): Promise<Position[]> {
  const allPositions: Position[] = [];

  // Step 1: Get standard perps positions (weight 2)
  try {
    const state = await getClearinghouseState(user);
    if (state.assetPositions && Array.isArray(state.assetPositions)) {
      for (const ap of state.assetPositions) {
        const pos = ap.position || ap;
        if (pos.szi && parseFloat(pos.szi) !== 0) {
          allPositions.push(pos);
        }
      }
    }
  } catch (err) {
    console.error(`[hlbot] Failed to fetch perp positions for ${user.slice(0, 10)}:`, err);
  }

  // Step 2: Discover HIP-3 dexes from recent fills (weight 20, single call)
  let dexNames: Set<string>;
  try {
    const recentFills = await getUserFills(user);
    dexNames = new Set<string>();
    for (const fill of recentFills) {
      const colonIdx = fill.coin.indexOf(":");
      if (colonIdx > 0) {
        dexNames.add(fill.coin.substring(0, colonIdx));
      }
    }
  } catch (err) {
    console.error(`[hlbot] Failed to discover HIP-3 dexes for ${user.slice(0, 10)}:`, err);
    return allPositions;
  }

  // Step 3: Query each HIP-3 dex (weight 2 each)
  for (const dex of dexNames) {
    try {
      const state = await getClearinghouseState(user, dex);
      if (!state.assetPositions || !Array.isArray(state.assetPositions)) continue;
      for (const ap of state.assetPositions) {
        const pos = ap.position || ap;
        if (pos.szi && parseFloat(pos.szi) !== 0) {
          if (pos.coin && !pos.coin.includes(":")) {
            pos.coin = `${dex}:${pos.coin}`;
          }
          allPositions.push(pos);
        }
      }
    } catch (err) {
      console.error(`[hlbot] Failed to fetch HIP-3 positions for dex ${dex}:`, err);
    }
  }

  return allPositions;
}

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

/** Fetch current mid prices for all assets */
export async function getAllMids(): Promise<Record<string, string>> {
  return (await postInfo({ type: "allMids" })) as Record<string, string>;
}

export async function getAddressStats(address: string): Promise<AddressStats> {
  // Sequential to avoid burst; fills is the heavy part (capped at 3 pages to limit weight)
  const fills = await getAllUserFills(address, CONFIG.allTimeStartMs, undefined, 3);
  const clearinghouse = await getClearinghouseState(address);

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
