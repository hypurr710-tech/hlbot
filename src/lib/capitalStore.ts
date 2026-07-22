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
