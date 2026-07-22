"use client";
import { useEffect, useMemo, useState } from "react";
import type { LiveSnapshot } from "@/lib/aggregator/types";
import {
  loadSpotTrades,
  addSpotTrade,
  removeSpotTrade,
  computeSpotPositions,
  type SpotTrade,
} from "@/lib/spotLedger";
import { loadTickerMap, type TickerMapEntry } from "@/lib/tickerMap";
import { selectLiveKrPrice } from "@/lib/arb";
import { formatKrwCompact, groupDigits, pnlColor } from "@/lib/format";

const krw = (v: number) => `₩${Math.round(v).toLocaleString("en-US")}`;

interface Props {
  snapshot: LiveSnapshot | null;
  /** 추가/삭제 후 부모가 현물 원금을 다시 계산하도록 알림 */
  onChange: () => void;
}

export default function SpotTradeLedger({ snapshot, onChange }: Props) {
  const [trades, setTrades] = useState<SpotTrade[]>([]);
  const [tickers, setTickers] = useState<TickerMapEntry[]>([]);
  const [hlSymbol, setHlSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [qtyRaw, setQtyRaw] = useState("");
  const [priceRaw, setPriceRaw] = useState("");
  const [memo, setMemo] = useState("");
  const [dateStr, setDateStr] = useState(""); // yyyy-MM-dd, 빈 값이면 오늘

  useEffect(() => {
    setTrades(loadSpotTrades());
    const map = loadTickerMap();
    setTickers(map);
    if (map.length > 0) setHlSymbol(map[0].hlSymbol);
  }, []);

  const refresh = () => {
    setTrades(loadSpotTrades());
    onChange();
  };

  const submit = () => {
    const quantity = parseFloat(qtyRaw.replace(/,/g, ""));
    const priceKrw = parseFloat(priceRaw.replace(/,/g, ""));
    const ticker = tickers.find((t) => t.hlSymbol === hlSymbol);
    if (!ticker || !Number.isFinite(quantity) || quantity <= 0) return;
    if (!Number.isFinite(priceKrw) || priceKrw <= 0) return;
    const ts = dateStr ? new Date(`${dateStr}T12:00:00`).getTime() : Date.now();
    addSpotTrade({
      ts,
      hlSymbol: ticker.hlSymbol,
      krCode: ticker.krCode,
      krName: ticker.krName,
      side,
      quantity,
      priceKrw,
      memo: memo.trim() || undefined,
    });
    setQtyRaw("");
    setPriceRaw("");
    setMemo("");
    refresh();
  };

  const positions = useMemo(() => computeSpotPositions(trades), [trades]);
  const held = positions.filter((p) => p.quantity > 0 || p.realizedKrw !== 0);
  const sorted = [...trades].sort((a, b) => b.ts - a.ts);

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">현물 매매장부</h3>
        <span className="text-[11px] text-hl-text-tertiary font-mono">
          {trades.length}건 · 기록된 종목은 현물 원금에 자동 반영
        </span>
      </div>

      {/* 종목별 포지션 요약 */}
      {held.length > 0 && (
        <div className="px-4 py-3 border-b border-hl-border grid grid-cols-1 md:grid-cols-2 gap-3">
          {held.map((p) => {
            const kr = snapshot?.kr[p.hlSymbol];
            const livePrice = kr ? selectLiveKrPrice(kr) : null;
            const pnlKrw = livePrice != null ? (livePrice - p.avgPriceKrw) * p.quantity : null;
            const pnlPct =
              livePrice != null && p.avgPriceKrw > 0
                ? ((livePrice - p.avgPriceKrw) / p.avgPriceKrw) * 100
                : null;
            return (
              <div key={p.krCode} className="bg-hl-bg-tertiary/40 border border-hl-border rounded-lg p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold text-hl-text-primary">{p.krName}</span>
                  <span className="text-[11px] font-mono text-hl-text-tertiary">
                    {p.quantity.toLocaleString("en-US")}주 보유
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                  <div className="text-hl-text-tertiary">
                    매수평단 <span className="text-hl-text-secondary">{p.avgPriceKrw > 0 ? krw(p.avgPriceKrw) : "—"}</span>
                  </div>
                  <div className="text-hl-text-tertiary">
                    현재가 <span className="text-hl-text-secondary">{livePrice != null ? krw(livePrice) : "—"}</span>
                  </div>
                  <div className="text-hl-text-tertiary">
                    투입원금 <span className="text-hl-text-secondary">{formatKrwCompact(p.investedKrw)}</span>
                  </div>
                  <div className="text-hl-text-tertiary">
                    평가손익{" "}
                    {pnlKrw != null && pnlPct != null ? (
                      <span className={pnlColor(pnlKrw)}>
                        {pnlKrw >= 0 ? "+" : ""}
                        {formatKrwCompact(pnlKrw)} ({pnlPct >= 0 ? "+" : ""}
                        {pnlPct.toFixed(2)}%)
                      </span>
                    ) : (
                      <span className="text-hl-text-secondary">—</span>
                    )}
                  </div>
                  {p.realizedKrw !== 0 && (
                    <div className="col-span-2 text-hl-text-tertiary">
                      실현손익{" "}
                      <span className={pnlColor(p.realizedKrw)}>
                        {p.realizedKrw >= 0 ? "+" : ""}
                        {formatKrwCompact(p.realizedKrw)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 입력 폼 */}
      <div className="px-4 py-3 border-b border-hl-border flex flex-wrap items-center gap-2 text-xs">
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-hl-text-primary font-mono"
        />
        <select
          value={hlSymbol}
          onChange={(e) => setHlSymbol(e.target.value)}
          className="bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-hl-text-primary"
        >
          {tickers.map((t) => (
            <option key={t.hlSymbol} value={t.hlSymbol}>
              {t.krName}
            </option>
          ))}
        </select>
        <div className="flex rounded overflow-hidden border border-hl-border">
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`px-2 py-1 ${
                side === s
                  ? s === "buy"
                    ? "bg-hl-green/20 text-hl-green"
                    : "bg-hl-red/20 text-hl-red"
                  : "text-hl-text-secondary hover:bg-hl-bg-hover"
              }`}
            >
              {s === "buy" ? "매수" : "매도"}
            </button>
          ))}
        </div>
        <input
          inputMode="decimal"
          placeholder="수량 (주)"
          value={qtyRaw}
          onChange={(e) => setQtyRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
          className="w-24 bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-right text-hl-text-primary font-mono"
        />
        <input
          inputMode="decimal"
          placeholder="단가 (₩)"
          value={priceRaw}
          onChange={(e) => setPriceRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
          className="w-32 bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-right text-hl-text-primary font-mono"
        />
        <input
          placeholder="메모"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="flex-1 min-w-24 bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-hl-text-primary"
        />
        <button
          onClick={submit}
          className="px-3 py-1 rounded bg-hl-accent/20 text-hl-accent hover:bg-hl-accent/30 transition-colors"
        >
          추가
        </button>
      </div>

      {/* 거래 내역 */}
      {sorted.length === 0 ? (
        <div className="h-16 flex items-center justify-center text-xs text-hl-text-tertiary">
          기록 없음 — 매수/매도를 입력하면 평단·평가손익이 자동 계산돼
        </div>
      ) : (
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-hl-text-tertiary">
              <th className="text-left px-4 py-2 font-medium">날짜</th>
              <th className="text-left px-2 py-2 font-medium">종목</th>
              <th className="text-left px-2 py-2 font-medium">구분</th>
              <th className="text-right px-2 py-2 font-medium">수량</th>
              <th className="text-right px-2 py-2 font-medium">단가</th>
              <th className="text-right px-2 py-2 font-medium">금액</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors">
                <td className="px-4 py-1.5 text-hl-text-secondary">
                  {new Date(t.ts).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                </td>
                <td className="px-2 py-1.5 text-hl-text-primary">{t.krName}</td>
                <td className={`px-2 py-1.5 ${t.side === "buy" ? "text-hl-green" : "text-hl-red"}`}>
                  {t.side === "buy" ? "매수" : "매도"}
                </td>
                <td className="px-2 py-1.5 text-right text-hl-text-secondary">
                  {t.quantity.toLocaleString("en-US")}
                </td>
                <td className="px-2 py-1.5 text-right text-hl-text-secondary">{krw(t.priceKrw)}</td>
                <td className="px-2 py-1.5 text-right text-hl-text-secondary">
                  {formatKrwCompact(t.quantity * t.priceKrw)}
                </td>
                <td className="px-4 py-1.5 text-right">
                  <button
                    onClick={() => { removeSpotTrade(t.id); refresh(); }}
                    className="text-hl-text-tertiary hover:text-hl-red transition-colors"
                    title="삭제"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
