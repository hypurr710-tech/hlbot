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
