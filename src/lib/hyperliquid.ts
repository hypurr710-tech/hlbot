const API_URL = "https://api.hyperliquid.xyz/info";

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
          const delay = Math.pow(2, attempt + 1) * 500; // 1s, 2s, 4s
          console.warn(`[hlbot] 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`, body.type);
          await new Promise((r) => setTimeout(r, delay));
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
    if (page > 0) await sleep(300); // Rate limit protection between pages
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
  user: string
): Promise<ClearinghouseState> {
  return (await postInfo({
    type: "clearinghouseState",
    user,
  })) as ClearinghouseState;
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
    getAllUserFills(address, ALL_TIME_START, undefined, 30),
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
