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
