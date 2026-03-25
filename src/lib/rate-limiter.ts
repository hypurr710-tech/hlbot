import { CONFIG } from "./config";

const { weightLimit, windowMs, minRequestGapMs, storageKey } = CONFIG.rateLimit;

const LIGHT_WEIGHT_TYPES = new Set([
  "clearinghouseState",
  "allMids",
  "l2Book",
  "orderStatus",
  "spotClearinghouseState",
  "exchangeStatus",
]);

export function getWeight(type: unknown): number {
  return LIGHT_WEIGHT_TYPES.has(type as string) ? 2 : 20;
}

// --- Persistent weight log (survives page reloads) ---
interface WeightEntry { weight: number; ts: number }
let weightLog: WeightEntry[] = [];
let lastRequestTs = 0;

function loadWeightLog(): void {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null;
    if (raw) {
      const parsed = JSON.parse(raw) as WeightEntry[];
      const cutoff = Date.now() - windowMs;
      weightLog = parsed.filter((e) => e.ts >= cutoff);
    }
  } catch (err) {
    console.warn("[hlbot] rate-limiter: failed to load weight log from localStorage", err);
  }
}

function saveWeightLog(): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey, JSON.stringify(weightLog));
    }
  } catch (err) {
    console.warn("[hlbot] rate-limiter: failed to save weight log to localStorage", err);
  }
}

// Load once on module init
loadWeightLog();

function consumedWeight(): number {
  const cutoff = Date.now() - windowMs;
  weightLog = weightLog.filter((e) => e.ts >= cutoff);
  return weightLog.reduce((s, e) => s + e.weight, 0);
}

/** Call when we receive a 429 — marks the budget as partially exhausted with a shorter cooldown. */
export function onRateLimited(): void {
  const now = Date.now();
  // Only block for ~30s instead of 60s by backdating the entry
  weightLog = [{ weight: weightLimit, ts: now - windowMs / 2 }];
  saveWeightLog();
}

export async function waitForBudget(weight: number): Promise<void> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const used = consumedWeight();
    if (used + weight <= weightLimit) {
      // Enforce minimum gap between requests to prevent bursts
      const now = Date.now();
      const gap = now - lastRequestTs;
      if (gap < minRequestGapMs) {
        await new Promise((r) => setTimeout(r, minRequestGapMs - gap));
      }
      lastRequestTs = Date.now();
      weightLog.push({ weight, ts: Date.now() });
      saveWeightLog();
      return;
    }
    // Wait until enough old entries expire
    const oldest = weightLog.length > 0 ? weightLog[0].ts : Date.now();
    const waitMs = Math.max(500, oldest + windowMs - Date.now() + 100);
    console.warn(
      `[hlbot] rate-limiter: used ${used}/${weightLimit} weight, waiting ${Math.round(waitMs / 1000)}s`
    );
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 10_000)));
  }
}
