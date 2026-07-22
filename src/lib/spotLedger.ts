/** 국내 증권사 현물 매매장부 — localStorage 저장 + 이동평균 포지션 계산. */

export interface SpotTrade {
  id: string;
  /** 체결 일시 (ms) */
  ts: number;
  /** 시세 조회 키 — snapshot.kr[hlSymbol] */
  hlSymbol: string;
  krCode: string;
  krName: string;
  side: "buy" | "sell";
  quantity: number;
  priceKrw: number;
  memo?: string;
}

const KEY = "hypurr_arb_spot_trades";

function read(): SpotTrade[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SpotTrade[]) : [];
  } catch {
    return [];
  }
}

function write(list: SpotTrade[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list));
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadSpotTrades(): SpotTrade[] {
  return read();
}

export function addSpotTrade(input: Omit<SpotTrade, "id">): SpotTrade {
  const t: SpotTrade = { ...input, id: genId() };
  write([...read(), t]);
  return t;
}

export function removeSpotTrade(id: string): void {
  write(read().filter((t) => t.id !== id));
}

export interface SpotPosition {
  hlSymbol: string;
  krCode: string;
  krName: string;
  /** 현재 보유 수량 */
  quantity: number;
  /** 이동평균 매수평단 (국내 증권사 방식 — 매도해도 평단 유지) */
  avgPriceKrw: number;
  /** 보유분 투입원금 = quantity × avgPriceKrw */
  investedKrw: number;
  /** 매도로 확정된 실현손익 누계 */
  realizedKrw: number;
  tradeCount: number;
}

/**
 * 거래를 시간순으로 재생해 종목별 포지션을 만든다.
 * 매수: 이동평균으로 평단 갱신. 매도: 평단 유지, (매도가 − 평단)×수량을 실현손익으로.
 * 보유량 초과 매도는 보유분까지만 반영(초과분 무시).
 */
export function computeSpotPositions(trades: SpotTrade[]): SpotPosition[] {
  const byCode = new Map<string, SpotPosition>();
  const sorted = [...trades].sort((a, b) => a.ts - b.ts);
  for (const t of sorted) {
    let p = byCode.get(t.krCode);
    if (!p) {
      p = {
        hlSymbol: t.hlSymbol,
        krCode: t.krCode,
        krName: t.krName,
        quantity: 0,
        avgPriceKrw: 0,
        investedKrw: 0,
        realizedKrw: 0,
        tradeCount: 0,
      };
      byCode.set(t.krCode, p);
    }
    p.tradeCount += 1;
    if (t.side === "buy") {
      const newQty = p.quantity + t.quantity;
      p.avgPriceKrw = newQty > 0 ? (p.quantity * p.avgPriceKrw + t.quantity * t.priceKrw) / newQty : 0;
      p.quantity = newQty;
    } else {
      const sellQty = Math.min(t.quantity, p.quantity);
      p.realizedKrw += (t.priceKrw - p.avgPriceKrw) * sellQty;
      p.quantity -= sellQty;
      if (p.quantity === 0) p.avgPriceKrw = 0;
    }
    p.investedKrw = p.quantity * p.avgPriceKrw;
  }
  return Array.from(byCode.values());
}
