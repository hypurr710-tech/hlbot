// Client-side rolling store of premium samples, keyed by HL symbol.
// The app is deployed serverless (Vercel), so there is no always-on sampler —
// instead the Premium page records a sample each time it sees a fresh snapshot
// while it is open. History therefore accumulates as long as a tab stays open.

export interface PremiumSample {
  t: number;   // ms timestamp
  ap: number;  // app premium %
  ki: number;  // USDT kimchi %
  sb: number;  // stock basis % (= ap - ki)
}

const KEY = "hlbot_premium_history";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // keep last 24h
const MIN_GAP_MS = 60 * 1000;           // record at most once per minute per symbol

type Store = Record<string, PremiumSample[]>;

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / disabled storage — ignore */
  }
}

/** Append a sample for a symbol (throttled + pruned to the retention window). */
export function recordPremiumSample(symbol: string, sample: PremiumSample): void {
  const store = read();
  const arr = store[symbol] ?? [];
  const last = arr[arr.length - 1];
  if (last && sample.t - last.t < MIN_GAP_MS) return; // throttle
  const cutoff = sample.t - MAX_AGE_MS;
  store[symbol] = [...arr.filter((s) => s.t >= cutoff), sample];
  write(store);
}

export function getPremiumHistory(symbol: string): PremiumSample[] {
  return read()[symbol] ?? [];
}
