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

export interface FundingEntry {
  coin: string;
  fundingRate: string;
  szi: string;
  time: number;
  hash: string;
  usdc: string;
  nSamples?: number;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

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
const MAX_FILL_PAGES = 20;

/** Fetch all fills with automatic pagination to bypass the 2000-per-request limit */
export async function getAllUserFills(
  user: string,
  startTime: number,
  endTime?: number
): Promise<Fill[]> {
  const allFills: Fill[] = [];
  let currentStart = startTime;

  for (let page = 0; page < MAX_FILL_PAGES; page++) {
    const fills = await getUserFills(user, currentStart, endTime);
    if (fills.length === 0) break;

    allFills.push(...fills);

    if (fills.length < FILLS_PAGE_LIMIT) break;

    // Next page starts after the last fill's time
    const lastTime = fills[fills.length - 1].time;
    currentStart = lastTime + 1;
  }

  return allFills;
}

export async function getClearinghouseState(
  user: string
): Promise<ClearinghouseState> {
  return (await postInfo({
    type: "clearinghouseState",
    user,
  })) as ClearinghouseState;
}

export async function getUserFunding(
  user: string,
  startTime: number,
  endTime?: number
): Promise<FundingEntry[]> {
  const body: Record<string, unknown> = {
    type: "userFunding",
    user,
    startTime,
  };
  if (endTime !== undefined) body.endTime = endTime;
  return (await postInfo(body)) as FundingEntry[];
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

export async function getAddressStats(address: string): Promise<AddressStats> {
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const [fills, clearinghouse, funding] = await Promise.all([
    getAllUserFills(address, thirtyDaysAgo),
    getClearinghouseState(address),
    getUserFunding(address, thirtyDaysAgo),
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

  let fundingPnl = 0;
  for (const f of funding) {
    fundingPnl += parseFloat(f.usdc);
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
    fundingPnl,
  };
}
