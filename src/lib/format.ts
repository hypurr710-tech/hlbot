/** Safely parse a number, returning 0 for NaN/undefined/null */
export function safeNum(val: number | undefined | null): number {
  if (val === undefined || val === null || isNaN(val)) return 0;
  return val;
}

/** Get the latest value from a portfolio history array */
export function latestFromHistory(history: [number, string][] | undefined): number {
  if (!history || history.length === 0) return 0;
  return safeNum(parseFloat(history[history.length - 1][1]));
}

/** Format price with dynamic decimal places based on magnitude */
export function formatPrice(val: number): string {
  if (val >= 100) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (val >= 1) return val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  return val.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 6 });
}

export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function pnlColor(value: number): string {
  if (value > 0) return "text-hl-green";
  if (value < 0) return "text-hl-red";
  return "text-hl-text-secondary";
}
