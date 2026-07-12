import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchNaverUsdKrw, parseNaverUsdKrwHtml } from "@/lib/aggregator/naverFx";

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

// Matches the actual live NAVER exchangeDetail.naver structure (verified 2026-07-10):
// The calculator table's first row shows KRW-per-USD as `<td>1,503.40<img ...></td>`.
// This is the most stable readable price on the page.
const HTML_FIXTURE_TD = `<html><body>
<table class="tbl_calculator">
  <thead><tr><th>1</th><th>5</th></tr></thead>
  <tbody>
    <tr>
      <td>1,503.40<img src="https://ssl.pstatic.net/static/nfinance/td_money_KRW.gif" alt=""></td>
      <td>7,517.00<img src="https://ssl.pstatic.net/static/nfinance/td_money_KRW.gif" alt=""></td>
    </tr>
  </tbody>
</table>
</body></html>`;

// Fallback: `<option value="1503.4"` inside the currency selectbox.
const HTML_FIXTURE_OPTION_ONLY = `<html><body>
<select id="select_from" class="selectbox-source">
  <option value="1" label="1">대한민국 원 KRW</option>
  <option value="1503.4" label="1" class="selectbox-default" selected="selected"> 미국 달러 USD</option>
  <option value="1715.91" label="1"> 유럽연합 유로 EUR</option>
</select>
</body></html>`;

describe("naverFx", () => {
  it("parses USD/KRW from NAVER calculator table td", () => {
    expect(parseNaverUsdKrwHtml(HTML_FIXTURE_TD)).toBe(1503.4);
  });

  it("falls back to option value when td not present", () => {
    expect(parseNaverUsdKrwHtml(HTML_FIXTURE_OPTION_ONLY)).toBe(1503.4);
  });

  it("returns null for malformed HTML", () => {
    expect(parseNaverUsdKrwHtml("<html></html>")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseNaverUsdKrwHtml("")).toBeNull();
  });

  it("fetch returns null on HTTP error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    expect(await fetchNaverUsdKrw()).toBeNull();
  });

  it("fetch returns null on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await fetchNaverUsdKrw()).toBeNull();
  });

  it("fetch returns parsed number on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(HTML_FIXTURE_TD, { status: 200, headers: { "Content-Type": "text/html" } })
    ));
    expect(await fetchNaverUsdKrw()).toBe(1503.4);
  });
});
