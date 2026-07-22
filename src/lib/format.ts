export function formatUsd(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  // Capital-scale amounts read cleaner as whole dollars with grouping…
  if (abs >= 1_000) return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
  // …but funding figures are often only a few dollars, where rounding to the
  // whole dollar throws away meaningful precision ($2.47 → $2). Keep 2 decimals.
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Format a raw numeric input string with thousands separators, preserving an
 *  in-progress trailing decimal (e.g. "10000000" → "10,000,000", "1000." → "1,000."). */
export function groupDigits(raw: string): string {
  if (!raw) return "";
  const [intPart, ...rest] = raw.split(".");
  const intFmt = intPart ? Number(intPart).toLocaleString("en-US") : "";
  const dec = rest.length ? "." + rest.join("") : "";
  return intFmt + dec;
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

/** 원화를 억/만원 단위로 축약 표기. 예: 2.5억, 3,500만, 9,000원 미만은 그대로. */
export function formatKrwCompact(valueKrw: number): string {
  const sign = valueKrw < 0 ? "-" : "";
  const abs = Math.abs(valueKrw);
  if (abs >= 100_000_000) {
    const eok = abs / 100_000_000;
    const s = eok >= 10 ? Math.round(eok).toLocaleString("en-US") : String(Math.round(eok * 10) / 10);
    return `${sign}₩${s}억`;
  }
  if (abs >= 10_000) {
    return `${sign}₩${Math.round(abs / 10_000).toLocaleString("en-US")}만`;
  }
  return `${sign}₩${Math.round(abs).toLocaleString("en-US")}`;
}
