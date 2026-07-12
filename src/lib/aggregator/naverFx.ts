const URL =
  "https://finance.naver.com/marketindex/exchangeDetail.naver?marketindexCd=FX_USDKRW";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Extract the current USD/KRW mid-rate ("매매기준율") from the NAVER exchange detail HTML.
 *
 * Live page structure verified 2026-07-10:
 *  - Primary: the calculator table's first data cell renders "1,503.40" followed by a KRW icon:
 *      <td>1,503.40<img src=".../td_money_KRW.gif" ...></td>
 *  - Fallback: the currency selectbox includes the raw value:
 *      <option value="1503.4" ... > 미국 달러 USD</option>
 *
 * We prefer the calculator td (2-decimal precision), then fall back to the option value.
 */
export function parseNaverUsdKrwHtml(html: string): number | null {
  // Primary: calculator table td, e.g. `<td>1,503.40<img ... td_money_KRW.gif`
  const tdMatch = html.match(
    /<td>([\d,]+\.\d+)<img[^>]*td_money_KRW\.gif/,
  );
  if (tdMatch) {
    const num = parseFloat(tdMatch[1].replace(/,/g, ""));
    if (Number.isFinite(num) && num > 0) return num;
  }

  // Fallback: `<option value="1503.4" ... > 미국 달러 USD</option>`
  const optMatch = html.match(
    /<option\s+value="([\d.]+)"[^>]*>\s*미국\s*달러\s*USD\s*<\/option>/,
  );
  if (optMatch) {
    const num = parseFloat(optMatch[1]);
    if (Number.isFinite(num) && num > 0) return num;
  }

  return null;
}

export async function fetchNaverUsdKrw(): Promise<number | null> {
  try {
    const res = await fetch(URL, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const html = await res.text();
    return parseNaverUsdKrwHtml(html);
  } catch {
    return null;
  }
}
