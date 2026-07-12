import type { HlAssetCtx } from "./types";

const API_URL = "https://api.hyperliquid.xyz/info";
const DEX = "xyz";

/**
 * Universe entry from the HL info API.
 * Note: for HIP-3 dexes, `name` is already fully qualified (e.g. "xyz:TSLA").
 */
interface RawUniverse {
  name: string;
}

/**
 * Asset context returned by `metaAndAssetCtxs`. All numeric fields are strings.
 * Verified 2026-07-12 against live `dex=xyz` response.
 */
interface RawAssetCtx {
  markPx: string;
  midPx?: string;
  funding: string;
  premium: string;
  openInterest: string;
  dayNtlVlm: string;
}

function toNum(s: string | undefined): number {
  const n = s === undefined ? NaN : parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fetch mark/mid/funding/OI/volume for every asset on the HL `xyz` HIP-3 dex.
 *
 * The keys of the returned record are the HL fully-qualified symbols
 * (e.g. `"xyz:TSLA"`, `"xyz:SKHX"`, `"xyz:SMSN"`), which match what the
 * upstream API returns in `meta.universe[].name` — no re-prefixing is needed.
 *
 * Throws on network/shape errors so the caller can decide fallback behavior.
 */
export async function fetchHlXyzCtxs(): Promise<Record<string, HlAssetCtx>> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs", dex: DEX }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HL info API error ${res.status}`);
  const data = (await res.json()) as [
    { universe: RawUniverse[] },
    RawAssetCtx[],
  ];
  if (!Array.isArray(data) || data.length !== 2) {
    throw new Error("HL info API bad shape");
  }
  const [meta, ctxs] = data;
  if (!meta || !Array.isArray(meta.universe) || !Array.isArray(ctxs)) {
    throw new Error("HL info API bad shape");
  }

  const out: Record<string, HlAssetCtx> = {};
  for (let i = 0; i < meta.universe.length; i++) {
    const name = meta.universe[i]?.name;
    const c = ctxs[i];
    if (!name || !c) continue;
    // HIP-3 universe names are already fully qualified (e.g. "xyz:TSLA");
    // do NOT re-prefix.
    out[name] = {
      markPx: toNum(c.markPx),
      midPx: toNum(c.midPx ?? c.markPx),
      fundingHourly: toNum(c.funding),
      premium: toNum(c.premium),
      openInterest: toNum(c.openInterest),
      dayNtlVlm: toNum(c.dayNtlVlm),
    };
  }
  return out;
}
