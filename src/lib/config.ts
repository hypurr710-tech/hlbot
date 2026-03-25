// Centralized configuration for Hypurr Tracker

export const CONFIG = {
  api: {
    url: process.env.NEXT_PUBLIC_HL_API_URL || "https://api.hyperliquid.xyz/info",
    timeoutMs: 15_000,
  },
  rateLimit: {
    /** Conservative weight budget (hard cap is 1200) */
    weightLimit: 800,
    /** Sliding window duration */
    windowMs: 60_000,
    /** Minimum gap between requests to prevent bursts */
    minRequestGapMs: 200,
    /** localStorage key for persisting weight log */
    storageKey: "hlbot_rate_weight_log",
  },
  pagination: {
    fillsPageLimit: 2_000,
    maxPages: 5,
  },
  timing: {
    /** Dashboard auto-refresh interval */
    dashboardRefreshMs: 120_000,
    /** Trades page auto-refresh interval */
    tradesRefreshMs: 90_000,
    /** Sleep between paginated fill requests */
    fillPageDelayMs: 500,
  },
  /** Hyperliquid launch: ~late 2022. Use Jan 1 2023 as safe all-time start. */
  allTimeStartMs: 1_672_531_200_000,
} satisfies Record<string, unknown>;
