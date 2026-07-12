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
