import type { KrQuote } from "./types";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Parse a NAVER numeric string like "2,180,000" or "-6,000" into a number.
 * Returns null if the value is not a finite number.
 */
function num(s: unknown): number | null {
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  if (typeof s !== "string") return null;
  const n = parseFloat(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch KR spot quote for a KRX code (e.g. "000660" for SK하이닉스).
 *
 * Live NAVER mobile JSON structure (verified 2026-07-10):
 *   closePrice:                    "2,180,000"   regular-session close, comma string
 *   compareToPreviousClosePrice:   "-6,000"      change vs previous close
 *   marketStatus:                  "OPEN" | "CLOSE"
 *   overMarketPriceInfo?: {
 *     tradingSessionType:          "PRE" | "AFTER_MARKET"
 *     overMarketStatus:            "OPEN" | "CLOSE"
 *     overPrice:                   "2,201,000"   after-hours price (NXT-equivalent)
 *   }
 *
 * NAVER uses "overMarketPriceInfo" for extended-hours trading, which serves the
 * same arb purpose as NXT (best available KR price outside regular session hours).
 */
export async function fetchNaverSpot(krCode: string): Promise<KrQuote | null> {
  const url = `https://m.stock.naver.com/api/stock/${krCode}/basic`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;

    const close = num(data.closePrice);
    const change = num(data.compareToPreviousClosePrice);
    if (close === null || change === null) return null;
    const prevClose = close - change;

    // Extended-hours session (NAVER's over-market info, used as NXT-equivalent).
    const overInfo = data.overMarketPriceInfo as
      | Record<string, unknown>
      | undefined;
    const nxtPrice = overInfo ? num(overInfo.overPrice) : null;
    const sessionRaw = String(overInfo?.tradingSessionType ?? "").toUpperCase();
    const nxtSession: "PRE" | "AFTER_MARKET" | null =
      sessionRaw === "PRE" || sessionRaw === "AFTER_MARKET"
        ? sessionRaw
        : null;

    // Prefer NAVER's own marketStatus if provided; otherwise use a KST heuristic
    // (regular session 09:00–15:30 KST, Mon–Fri).
    const rawStatus = String(data.marketStatus ?? "").toUpperCase();
    let marketOpen: boolean;
    if (rawStatus === "OPEN") {
      marketOpen = true;
    } else if (rawStatus === "CLOSE") {
      marketOpen = false;
    } else {
      const now = new Date();
      const kst = new Date(
        now.getTime() + (now.getTimezoneOffset() + 9 * 60) * 60000,
      );
      const day = kst.getUTCDay();
      const mins = kst.getUTCHours() * 60 + kst.getUTCMinutes();
      marketOpen =
        day >= 1 && day <= 5 && mins >= 9 * 60 && mins <= 15 * 60 + 30;
    }

    return { close, prevClose, nxtPrice, nxtSession, marketOpen };
  } catch {
    return null;
  }
}
