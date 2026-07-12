"use client";
import { useEffect, useMemo, useState } from "react";
import { useLiveSnapshot } from "@/app/arb/useLiveSnapshot";
import { loadTickerMap } from "@/lib/tickerMap";
import { calcCapitalUsd, calcAprPct, selectLiveKrPrice } from "@/lib/arb";
import { groupDigits } from "@/lib/format";

const won = (n: number) => `₩${Math.round(n).toLocaleString("ko-KR")}`;
const usd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: n < 1000 ? 2 : 0, maximumFractionDigits: n < 1000 ? 2 : 0 })}`;

export default function CalculatorPage() {
  const { snapshot } = useLiveSnapshot();

  const [amountStr, setAmountStr] = useState("10000000"); // 1천만원 기본
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [aprStr, setAprStr] = useState("20");
  const [fxStr, setFxStr] = useState("");
  const [symbol, setSymbol] = useState("");

  const symbols = useMemo(() => loadTickerMap(), []);

  // Live delta-neutral funding APR per mapped symbol (same basis as the scanner).
  const symbolAprs = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    if (!snapshot || snapshot.fx.usdKrwHana == null || snapshot.fx.usdtKrwUpbit == null) return m;
    for (const t of symbols) {
      const hl = snapshot.hl[t.hlSymbol];
      const kr = snapshot.kr[t.hlSymbol];
      if (!hl || !kr) continue;
      const krLive = selectLiveKrPrice(kr);
      const krQuantity = krLive > 0 ? (hl.markPx * snapshot.fx.usdKrwHana) / krLive : 0;
      const capital = calcCapitalUsd({
        hlSizeAbs: 1, hlMarkUsd: hl.markPx, krQuantity, krAvgPriceKrw: krLive, usdKrwHana: snapshot.fx.usdKrwHana,
      });
      m[t.hlSymbol] = calcAprPct({ hlNotionalUsd: hl.markPx, fundingHourly: hl.fundingHourly, capitalUsd: capital });
    }
    return m;
  }, [snapshot, symbols]);

  // Auto-fill FX from the live snapshot once (user can override afterwards).
  useEffect(() => {
    if (fxStr === "" && snapshot?.fx.usdKrwHana != null) setFxStr(String(snapshot.fx.usdKrwHana));
  }, [snapshot, fxStr]);

  const amount = parseFloat(amountStr) || 0;
  const apr = parseFloat(aprStr) || 0;
  const fx = parseFloat(fxStr) || 0;

  const capitalKrw = currency === "KRW" ? amount : amount * fx;
  const capitalUsd = currency === "USD" ? amount : fx > 0 ? amount / fx : 0;

  const yearlyKrw = (capitalKrw * apr) / 100;
  const yearlyUsd = (capitalUsd * apr) / 100;

  const rows = [
    { label: "일 이자", krw: yearlyKrw / 365, usd: yearlyUsd / 365 },
    { label: "월 이자", krw: yearlyKrw / 12, usd: yearlyUsd / 12 },
    { label: "연 이자", krw: yearlyKrw, usd: yearlyUsd, strong: true },
  ];

  const pickSymbol = (sym: string) => {
    setSymbol(sym);
    const a = symbolAprs[sym];
    if (a != null && Number.isFinite(a)) setAprStr(a.toFixed(1));
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">APR 계산기</h1>
        <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
          투입금액과 예상 APR로 델타중립 펀딩 수익(이자)을 환율 적용해 계산합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-5 space-y-5">
          <Field label="투입금액">
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                value={groupDigits(amountStr)}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9.]/g, ""))}
                className="flex-1 bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary text-right outline-none focus:border-hl-border-light"
              />
              <div className="flex rounded overflow-hidden border border-hl-border">
                {(["KRW", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`px-3 text-sm font-mono transition-colors ${
                      currency === c ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-[11px] text-hl-text-tertiary mt-1">
              {currency === "KRW" ? `≈ ${usd(capitalUsd)}` : `≈ ${won(capitalKrw)}`} (양쪽 레그 합산 기준)
            </p>
          </Field>

          <Field label="예상 APR (%)">
            <input
              inputMode="decimal"
              value={aprStr}
              onChange={(e) => setAprStr(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary text-right outline-none focus:border-hl-border-light"
            />
            {symbols.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className="text-[11px] text-hl-text-tertiary">종목 현재 APR로 채우기:</span>
                {symbols.map((t) => (
                  <button
                    key={t.hlSymbol}
                    onClick={() => pickSymbol(t.hlSymbol)}
                    className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                      symbol === t.hlSymbol
                        ? "bg-hl-accent/15 border-hl-accent/40 text-hl-accent"
                        : "border-hl-border text-hl-text-secondary hover:text-hl-text-primary"
                    }`}
                  >
                    {t.krName}
                    {symbolAprs[t.hlSymbol] != null && (
                      <span className="ml-1 font-mono">{symbolAprs[t.hlSymbol].toFixed(1)}%</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Field>

          <Field label="환율 (USD/KRW)">
            <input
              inputMode="decimal"
              value={fxStr}
              onChange={(e) => setFxStr(e.target.value.replace(/[^0-9.]/g, ""))}
              className="w-full bg-hl-bg-tertiary border border-hl-border rounded px-3 py-2 font-mono text-hl-text-primary text-right outline-none focus:border-hl-border-light"
            />
            <p className="text-[11px] text-hl-text-tertiary mt-1">라이브(하나은행)에서 자동 채움 · 수정 가능</p>
          </Field>
        </div>

        {/* Results */}
        <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 bg-hl-bg-tertiary border-b border-hl-border">
            <div className="text-[11px] text-hl-text-tertiary uppercase tracking-wider">투입 자본</div>
            <div className="text-2xl font-bold font-mono text-hl-text-primary tabular-nums">{won(capitalKrw)}</div>
            <div className="text-xs text-hl-text-tertiary font-mono">{usd(capitalUsd)} · APR {apr.toFixed(1)}%</div>
          </div>
          <div className="divide-y divide-hl-border">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-5 py-4">
                <span className={`text-sm ${r.strong ? "text-hl-text-primary font-semibold" : "text-hl-text-secondary"}`}>
                  {r.label}
                </span>
                <div className="text-right font-mono tabular-nums">
                  <div className={`${r.strong ? "text-2xl font-bold text-hl-green" : "text-lg font-semibold text-hl-text-primary"}`}>
                    {won(r.krw)}
                  </div>
                  <div className="text-xs text-hl-text-tertiary">{usd(r.usd)}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 text-[11px] text-hl-text-tertiary bg-hl-bg-primary/40 border-t border-hl-border leading-relaxed">
            gross 기준 (HL 수수료·국내 거래세·환전 스프레드 제외) · APR 유지 가정. 펀딩률은 시간마다 변동.
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-hl-text-tertiary uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}
