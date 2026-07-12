import { NextResponse } from "next/server";
import { fetchHlXyzCtxs } from "@/lib/aggregator/hlXyz";
import { fetchUpbitUsdtKrw } from "@/lib/aggregator/upbitFx";
import { fetchNaverUsdKrw } from "@/lib/aggregator/naverFx";
import { fetchNaverSpot } from "@/lib/aggregator/naverSpot";
import { LiveSnapshotSchema, type LiveSnapshot } from "@/lib/aggregator/types";
import seed from "@/lib/tickerMap.seed.json";

interface SeedEntry { hlSymbol: string; krCode: string; krName: string; market: string }
const seedList = seed as SeedEntry[];

interface CacheEntry<T> { value: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.value as T);
  return fn().then((v) => {
    cache.set(key, { value: v, ts: Date.now() });
    return v;
  });
}

export async function GET(request: Request) {
  const warnings: string[] = [];

  // Parse ticker overrides from query
  const url = new URL(request.url);
  const rawTickers = url.searchParams.get("tickers");
  const requestedTickers: Array<{ hlSymbol: string; krCode: string }> = rawTickers
    ? rawTickers.split(",").map((s) => {
        const parts = s.split(":").map((p) => p.trim());
        // Expect "xyz:SYM:KRCODE" → 3 parts
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
        return { hlSymbol: `${parts[0]}:${parts[1]}`, krCode: parts[2] };
      }).filter((t): t is { hlSymbol: string; krCode: string } => t !== null)
    : [];

  // Union with seed, dedup by hlSymbol
  const symbolMap = new Map<string, string>(); // hlSymbol -> krCode
  for (const s of seedList) symbolMap.set(s.hlSymbol, s.krCode);
  for (const t of requestedTickers) symbolMap.set(t.hlSymbol, t.krCode);
  const allTickers = Array.from(symbolMap.entries()).map(([hlSymbol, krCode]) => ({ hlSymbol, krCode }));

  const [hlResult, upbitResult, naverFxResult] = await Promise.allSettled([
    cached("hl:xyz", 5000, fetchHlXyzCtxs),
    cached("fx:upbit", 5000, fetchUpbitUsdtKrw),
    cached("fx:naver", 30000, fetchNaverUsdKrw),
  ]);

  const hl = hlResult.status === "fulfilled" ? hlResult.value : {};
  if (hlResult.status === "rejected") warnings.push("hl_xyz_failed");

  const usdtKrwUpbit = upbitResult.status === "fulfilled" ? upbitResult.value : null;
  if (upbitResult.status === "rejected" || usdtKrwUpbit === null) warnings.push("upbit_failed");

  const usdKrwHana = naverFxResult.status === "fulfilled" ? naverFxResult.value : null;
  if (naverFxResult.status === "rejected" || usdKrwHana === null) warnings.push("naver_fx_failed");

  // Fetch KR spots for every mapped symbol in parallel
  const krEntries = await Promise.all(
    allTickers.map(async (t) => {
      const q = await cached(`kr:${t.krCode}`, 5000, () => fetchNaverSpot(t.krCode));
      return [t.hlSymbol, q] as const;
    })
  );
  const kr: LiveSnapshot["kr"] = {};
  for (const [hlSymbol, q] of krEntries) {
    if (q) kr[hlSymbol] = q;
    else warnings.push(`naver_spot_${hlSymbol}_failed`);
  }

  const snapshot: LiveSnapshot = {
    ts: Date.now(),
    fx: { usdKrwHana, usdtKrwUpbit },
    hl,
    kr,
    warnings,
  };

  const parsed = LiveSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "snapshot_validation_failed", detail: parsed.error.flatten() },
      { status: 500 }
    );
  }
  return NextResponse.json(parsed.data, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
