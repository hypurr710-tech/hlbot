const URL = "https://api.upbit.com/v1/ticker?markets=KRW-USDT";

export async function fetchUpbitUsdtKrw(): Promise<number | null> {
  try {
    const res = await fetch(URL, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ trade_price?: number }>;
    if (!Array.isArray(data) || data.length === 0) return null;
    const px = data[0]?.trade_price;
    return typeof px === "number" && px > 0 ? px : null;
  } catch {
    return null;
  }
}
