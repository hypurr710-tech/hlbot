"use client";
import { useEffect, useMemo, useState } from "react";
import { useLiveSnapshot } from "@/app/arb/useLiveSnapshot";
import { useHlXyzShorts } from "@/app/arb/useHlXyzShorts";
import { useHlEquity } from "@/app/arb/history/useHlEquity";
import { useAddresses } from "@/lib/store";
import { useArbPairs } from "@/hooks/useArbPairs";
import { loadTickerMap } from "@/lib/tickerMap";
import { calcCapitalForBasis, calcAprPct, selectLiveKrPrice } from "@/lib/arb";
import { loadSpotTrades, computeSpotPositions } from "@/lib/spotLedger";
import { loadCapitalEvents, capitalAdjustmentUsd } from "@/lib/capitalStore";
import {
  loadPortfolioItems,
  addPortfolioItem,
  removePortfolioItem,
  computePortfolio,
  type PortfolioItem,
  type PortfolioItemType,
} from "@/lib/portfolio";
import { formatKrwCompact, formatUsd, groupDigits, pnlColor } from "@/lib/format";
import { useAprBasis } from "@/lib/aprBasis";
import StatCard from "@/components/StatCard";

const TYPE_LABEL: Record<PortfolioItemType, string> = {
  interest: "이자형",
  income: "고정수입",
  funding: "펀딩파밍",
};

const krw = (v: number) => `₩${Math.round(v).toLocaleString("ko-KR")}`;

export default function PortfolioPage() {
  const { snapshot } = useLiveSnapshot();
  const shorts = useHlXyzShorts();
  const { addresses: trackedAddresses } = useAddresses();
  const { pairs } = useArbPairs();
  const { basis } = useAprBasis();

  // ---- 펀딩파밍 라이브 컨텍스트 (/arb/history와 동일 정의) ----
  const addresses = useMemo(
    () =>
      Array.from(
        new Set([
          ...trackedAddresses.map((a) => a.address.toLowerCase()),
          ...pairs.map((p) => p.hlAddress.toLowerCase()),
        ])
      ).sort(),
    [trackedAddresses, pairs]
  );
  const { totalEquityUsd } = useHlEquity(addresses);

  const [version, setVersion] = useState(0);
  const items = useMemo(() => loadPortfolioItems(), [version]);

  const usdKrw = snapshot?.fx.usdKrwHana ?? null;

  const fundingCtx = useMemo(() => {
    if (totalEquityUsd == null || usdKrw == null || usdKrw <= 0) return null;
    const positions = computeSpotPositions(loadSpotTrades());
    const recordedCodes = new Set(positions.map((p) => p.krCode));
    const spotKrw =
      positions.reduce((s, p) => s + p.investedKrw, 0) +
      pairs
        .filter((p) => !p.closedAt && !recordedCodes.has(p.krLeg.krCode))
        .reduce((s, p) => s + p.krLeg.quantity * p.krLeg.avgPriceKrw, 0);
    const otherUsd = capitalAdjustmentUsd(loadCapitalEvents());
    const capitalUsd = totalEquityUsd + spotKrw / usdKrw + otherUsd;
    if (capitalUsd <= 0) return null;
    let hourlyUsd = 0;
    if (snapshot) {
      for (const s of shorts) {
        const hl = snapshot.hl[s.hlSymbol];
        if (hl) hourlyUsd += s.sizeAbs * hl.markPx * hl.fundingHourly;
      }
    }
    const aprPct = (hourlyUsd * 8760 / capitalUsd) * 100;
    return { capitalUsd, aprPct };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalEquityUsd, usdKrw, snapshot, shorts, pairs, version]);

  const { rows, totals } = useMemo(
    () => computePortfolio(items, { usdKrw, funding: fundingCtx }),
    [items, usdKrw, fundingCtx]
  );

  // ---- 종목 APR 프리셋 (스캐너와 동일 계산) ----
  const symbols = useMemo(() => loadTickerMap(), []);
  const symbolAprs = useMemo<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    if (!snapshot || snapshot.fx.usdKrwHana == null) return m;
    for (const t of symbols) {
      const hl = snapshot.hl[t.hlSymbol];
      const kr = snapshot.kr[t.hlSymbol];
      if (!hl || !kr) continue;
      const krLive = selectLiveKrPrice(kr);
      const krQuantity = krLive > 0 ? (hl.markPx * snapshot.fx.usdKrwHana) / krLive : 0;
      const capital = calcCapitalForBasis({
        hlSizeAbs: 1, hlMarkUsd: hl.markPx, krQuantity, krAvgPriceKrw: krLive,
        usdKrwHana: snapshot.fx.usdKrwHana, basis,
      });
      m[t.hlSymbol] = calcAprPct({ hlNotionalUsd: hl.markPx, fundingHourly: hl.fundingHourly, capitalUsd: capital });
    }
    return m;
  }, [snapshot, symbols, basis]);

  // ---- 추가 폼 ----
  const [formType, setFormType] = useState<PortfolioItemType>("interest");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<"KRW" | "USD">("KRW");
  const [principalRaw, setPrincipalRaw] = useState("");
  const [aprRaw, setAprRaw] = useState("");
  const [monthlyRaw, setMonthlyRaw] = useState("");

  const num = (s: string) => {
    const v = parseFloat(s.replace(/,/g, ""));
    return Number.isFinite(v) ? v : undefined;
  };

  const submit = () => {
    if (formType === "funding") {
      addPortfolioItem({
        name: name.trim() || "펀딩파밍 (라이브)",
        type: "funding",
        currency: "USD",
        aprPct: num(aprRaw), // 비우면 라이브 APR
      });
    } else if (formType === "interest") {
      const principal = num(principalRaw);
      const aprPct = num(aprRaw);
      if (!name.trim() || principal == null || principal <= 0 || aprPct == null) return;
      addPortfolioItem({ name: name.trim(), type: "interest", currency, principal, aprPct });
    } else {
      const monthlyAmount = num(monthlyRaw);
      if (!name.trim() || monthlyAmount == null || monthlyAmount <= 0) return;
      addPortfolioItem({
        name: name.trim(), type: "income", currency, monthlyAmount,
        principal: num(principalRaw),
      });
    }
    setName(""); setPrincipalRaw(""); setAprRaw(""); setMonthlyRaw("");
    setVersion((v) => v + 1);
  };

  const hasFundingItem = items.some((i) => i.type === "funding");
  const inputCls =
    "bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-hl-text-primary font-mono";

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">Portfolio</h1>
        <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
          자산별 이자율·현금흐름을 등록해 포트폴리오 전체의 수익 구조를 추적합니다 (세전)
        </p>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard
          title="총 자산"
          value={formatKrwCompact(totals.principalKrw)}
          subtitle={
            usdKrw != null && usdKrw > 0 ? `≈ ${formatUsd(totals.principalKrw / usdKrw)}` : "원금 있는 항목 합"
          }
          loading={!snapshot && items.length > 0}
        />
        <StatCard
          title="가중평균 APR"
          value={`${totals.weightedAprPct.toFixed(2)}%`}
          subtitle="원금 항목 기준 (근로소득 제외)"
          loading={!snapshot && items.length > 0}
        />
        <StatCard
          title="월 현금흐름"
          value={formatKrwCompact(totals.monthlyKrw)}
          valueClass={pnlColor(totals.monthlyKrw)}
          subtitle={usdKrw != null && usdKrw > 0 ? `≈ ${formatUsd(totals.monthlyKrw / usdKrw)}` : undefined}
          loading={!snapshot && items.length > 0}
        />
        <StatCard
          title="연 현금흐름"
          value={formatKrwCompact(totals.yearlyKrw)}
          valueClass={pnlColor(totals.yearlyKrw)}
          subtitle={usdKrw != null && usdKrw > 0 ? `≈ ${formatUsd(totals.yearlyKrw / usdKrw)}` : undefined}
          loading={!snapshot && items.length > 0}
        />
      </div>

      {/* 항목 테이블 */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-hl-text-primary">자산 항목</h3>
          <span className="text-[11px] text-hl-text-tertiary font-mono">{items.length}개</span>
        </div>
        {rows.length === 0 ? (
          <div className="h-24 flex items-center justify-center text-xs text-hl-text-tertiary">
            아래에서 자산을 추가해봐 — 예금·스테이블·근로소득·펀딩파밍 뭐든
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] font-mono">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-hl-text-tertiary">
                  <th className="text-left px-4 py-2 font-medium">이름</th>
                  <th className="text-left px-2 py-2 font-medium">유형</th>
                  <th className="text-right px-2 py-2 font-medium">원금</th>
                  <th className="text-right px-2 py-2 font-medium">연이율</th>
                  <th className="text-right px-2 py-2 font-medium">월</th>
                  <th className="text-right px-2 py-2 font-medium">연</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors">
                    <td className="px-4 py-2 text-hl-text-primary">
                      {r.name}
                      {r.auto && (
                        <span className="ml-1.5 px-1 py-px rounded bg-hl-bg-tertiary text-[9px] text-hl-accent/80">
                          자동
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-hl-text-tertiary">{TYPE_LABEL[r.type]}</td>
                    <td className="px-2 py-2 text-right text-hl-text-secondary">
                      {r.principalKrw != null && r.principalKrw > 0 ? formatKrwCompact(r.principalKrw) : "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-hl-text-secondary">
                      {r.aprPct != null ? `${r.aprPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className={`px-2 py-2 text-right ${r.monthlyKrw != null ? pnlColor(r.monthlyKrw) : "text-hl-text-tertiary"}`}>
                      {r.monthlyKrw != null ? formatKrwCompact(r.monthlyKrw) : "—"}
                    </td>
                    <td className={`px-2 py-2 text-right ${r.yearlyKrw != null ? pnlColor(r.yearlyKrw) : "text-hl-text-tertiary"}`}>
                      {r.yearlyKrw != null ? formatKrwCompact(r.yearlyKrw) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => { removePortfolioItem(r.id); setVersion((v) => v + 1); }}
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
          </div>
        )}
      </div>

      {/* 추가 폼 */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-hl-text-tertiary">유형</span>
          <div className="flex rounded overflow-hidden border border-hl-border">
            {(Object.keys(TYPE_LABEL) as PortfolioItemType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFormType(t)}
                className={`px-2.5 py-1 ${formType === t ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"}`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {formType !== "funding" && (
            <>
              <input
                placeholder="이름 (예: 파킹통장, 월급)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`${inputCls} w-44`}
              />
              <div className="flex rounded overflow-hidden border border-hl-border">
                {(["KRW", "USD"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={`px-2 py-1 ${currency === c ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"}`}
                  >
                    {c === "KRW" ? "₩" : "$"}
                  </button>
                ))}
              </div>
            </>
          )}

          {formType === "interest" && (
            <>
              <input
                inputMode="decimal"
                placeholder="원금"
                value={principalRaw}
                onChange={(e) => setPrincipalRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
                className={`${inputCls} w-36 text-right`}
              />
              <input
                inputMode="decimal"
                placeholder="연이율 %"
                value={aprRaw}
                onChange={(e) => setAprRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                className={`${inputCls} w-24 text-right`}
              />
              <select
                onChange={(e) => {
                  const a = symbolAprs[e.target.value];
                  if (a != null && Number.isFinite(a)) setAprRaw(a.toFixed(1));
                }}
                defaultValue=""
                className={`${inputCls}`}
              >
                <option value="" disabled>종목 APR 불러오기</option>
                {symbols.map((t) => (
                  <option key={t.hlSymbol} value={t.hlSymbol}>
                    {t.krName} {symbolAprs[t.hlSymbol] != null ? `${symbolAprs[t.hlSymbol].toFixed(1)}%` : ""}
                  </option>
                ))}
              </select>
            </>
          )}

          {formType === "income" && (
            <>
              <input
                inputMode="decimal"
                placeholder="월 금액"
                value={monthlyRaw}
                onChange={(e) => setMonthlyRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
                className={`${inputCls} w-36 text-right`}
              />
              <input
                inputMode="decimal"
                placeholder="원금 (선택 — 부동산 투자금 등)"
                value={principalRaw}
                onChange={(e) => setPrincipalRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
                className={`${inputCls} w-56 text-right`}
              />
            </>
          )}

          {formType === "funding" && (
            <>
              <span className="text-hl-text-tertiary">
                투입자본(HL 예치금+현물 원금)과 예상 APR을 실시간으로 가져와
                {fundingCtx != null && (
                  <span className="ml-1 text-hl-text-secondary">
                    — 지금 {formatUsd(fundingCtx.capitalUsd)} × {fundingCtx.aprPct.toFixed(1)}%
                  </span>
                )}
              </span>
              <input
                inputMode="decimal"
                placeholder="이율 고정 (선택)"
                value={aprRaw}
                onChange={(e) => setAprRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                className={`${inputCls} w-32 text-right`}
              />
              {hasFundingItem && (
                <span className="text-hl-yellow/80">이미 펀딩파밍 항목이 있어 — 중복 추가 주의</span>
              )}
            </>
          )}

          <button
            onClick={submit}
            className="px-3 py-1 rounded bg-hl-accent/20 text-hl-accent hover:bg-hl-accent/30 transition-colors"
          >
            추가
          </button>
        </div>
      </div>

      <footer className="pt-4 border-t border-hl-border text-[11px] text-hl-text-tertiary font-mono leading-relaxed">
        <ul className="space-y-0.5">
          <li>· 모든 값 세전(gross) · USD 항목은 하나은행 환율{usdKrw != null ? ` ₩${usdKrw.toLocaleString("ko-KR")}` : ""}로 환산</li>
          <li>· 가중평균 APR = 원금 있는 항목들의 연 수익 합 ÷ 원금 합 (근로소득처럼 원금 없는 항목은 현금흐름에만 포함)</li>
          <li>· 펀딩파밍 예상 APR은 현재 펀딩률 기준 — 실제 실현 수익은 Funding 기록 탭에서 확인</li>
        </ul>
      </footer>
    </div>
  );
}
