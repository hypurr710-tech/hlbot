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
  loadProfiles,
  addProfile,
  removeProfile,
  getActiveProfileId,
  setActiveProfileId,
  type PortfolioProfile,
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
  const [profiles, setProfiles] = useState<PortfolioProfile[]>([]);
  const [profileId, setProfileId] = useState<string>("default");
  const [newProfileName, setNewProfileName] = useState("");

  useEffect(() => {
    setProfiles(loadProfiles());
    setProfileId(getActiveProfileId());
  }, []);

  const switchProfile = (id: string) => {
    setActiveProfileId(id);
    setProfileId(id);
    setVersion((v) => v + 1);
  };

  const createProfile = () => {
    const name = newProfileName.trim();
    if (!name) return;
    const p = addProfile(name);
    setProfiles(loadProfiles());
    setNewProfileName("");
    switchProfile(p.id);
  };

  const deleteProfile = (id: string) => {
    removeProfile(id);
    const rest = loadProfiles();
    setProfiles(rest);
    switchProfile(getActiveProfileId());
  };

  const items = useMemo(() => loadPortfolioItems(profileId), [profileId, version]);

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
      }, profileId);
    } else if (formType === "interest") {
      const principal = num(principalRaw);
      const aprPct = num(aprRaw);
      if (!name.trim() || principal == null || principal <= 0 || aprPct == null) return;
      addPortfolioItem({ name: name.trim(), type: "interest", currency, principal, aprPct }, profileId);
    } else {
      const monthlyAmount = num(monthlyRaw);
      if (!name.trim() || monthlyAmount == null || monthlyAmount <= 0) return;
      addPortfolioItem({
        name: name.trim(), type: "income", currency, monthlyAmount,
        principal: num(principalRaw),
      }, profileId);
    }
    setName(""); setPrincipalRaw(""); setAprRaw(""); setMonthlyRaw("");
    setVersion((v) => v + 1);
  };

  const hasFundingItem = items.some((i) => i.type === "funding");
  const inputCls =
    "bg-hl-bg-tertiary border border-hl-border rounded-lg px-3 py-2.5 text-sm text-hl-text-primary font-mono placeholder:text-hl-text-tertiary focus:border-hl-accent/60 focus:outline-none transition-colors";
  const fieldLabelCls = "block text-[11px] uppercase tracking-wider text-hl-text-tertiary mb-1.5";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">Portfolio</h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            자산별 이자율·현금흐름을 등록해 포트폴리오 전체의 수익 구조를 추적합니다 (세전)
          </p>
        </div>
        {/* 프로필 전환 (내꺼/아빠꺼 등) — 프로필별로 항목이 분리 저장됨 */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {profiles.map((p) => (
            <span
              key={p.id}
              className={`flex items-center rounded-lg overflow-hidden border ${
                profileId === p.id ? "border-hl-accent/60" : "border-hl-border"
              }`}
            >
              <button
                onClick={() => switchProfile(p.id)}
                className={`px-2.5 py-1 ${
                  profileId === p.id
                    ? "bg-hl-accent/20 text-hl-accent"
                    : "text-hl-text-secondary hover:bg-hl-bg-hover"
                }`}
              >
                {p.name}
              </button>
              {profiles.length > 1 && (
                <button
                  onClick={() => deleteProfile(p.id)}
                  className="px-1.5 py-1 text-hl-text-tertiary hover:text-hl-red"
                  title={`${p.name} 프로필 삭제 (항목도 함께 삭제)`}
                >
                  ✕
                </button>
              )}
            </span>
          ))}
          <input
            placeholder="새 프로필"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") createProfile(); }}
            className="w-24 bg-hl-bg-tertiary border border-hl-border rounded-lg px-2 py-1 text-hl-text-primary"
          />
          <button
            onClick={createProfile}
            className="px-2 py-1 rounded-lg bg-hl-accent/20 text-hl-accent hover:bg-hl-accent/30 transition-colors"
          >
            + 추가
          </button>
        </div>
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
        <div className="px-5 py-3.5 border-b border-hl-border flex items-baseline justify-between">
          <h3 className="text-base font-semibold text-hl-text-primary">자산 항목</h3>
          <span className="text-xs text-hl-text-tertiary font-mono">{items.length}개</span>
        </div>
        {rows.length === 0 ? (
          <div className="h-28 flex items-center justify-center text-sm text-hl-text-tertiary">
            아래에서 자산을 추가해봐 — 예금·스테이블·근로소득·펀딩파밍 뭐든
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-hl-text-tertiary bg-hl-bg-tertiary/40">
                  <th className="text-left px-5 py-2.5 font-medium">이름</th>
                  <th className="text-left px-3 py-2.5 font-medium">유형</th>
                  <th className="text-right px-3 py-2.5 font-medium">원금</th>
                  <th className="text-right px-3 py-2.5 font-medium">연이율</th>
                  <th className="text-right px-3 py-2.5 font-medium">월 현금흐름</th>
                  <th className="text-right px-3 py-2.5 font-medium">연 현금흐름</th>
                  <th className="px-5 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors">
                    <td className="px-5 py-3 text-hl-text-primary font-medium">
                      {r.name}
                      {r.auto && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-hl-accent/10 text-[10px] text-hl-accent">
                          자동
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="px-2 py-0.5 rounded bg-hl-bg-tertiary text-xs text-hl-text-secondary">
                        {TYPE_LABEL[r.type]}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-hl-text-primary">
                      {r.principalKrw != null && r.principalKrw > 0 ? formatKrwCompact(r.principalKrw) : "—"}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-hl-accent">
                      {r.aprPct != null ? `${r.aprPct.toFixed(1)}%` : "—"}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono font-semibold ${r.monthlyKrw != null ? pnlColor(r.monthlyKrw) : "text-hl-text-tertiary"}`}>
                      {r.monthlyKrw != null ? formatKrwCompact(r.monthlyKrw) : "—"}
                    </td>
                    <td className={`px-3 py-3 text-right font-mono ${r.yearlyKrw != null ? pnlColor(r.yearlyKrw) : "text-hl-text-tertiary"}`}>
                      {r.yearlyKrw != null ? formatKrwCompact(r.yearlyKrw) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => { removePortfolioItem(r.id, profileId); setVersion((v) => v + 1); }}
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
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-hl-border flex items-center justify-between">
          <h3 className="text-base font-semibold text-hl-text-primary">자산 추가</h3>
          <div className="flex rounded-lg overflow-hidden border border-hl-border text-sm">
            {(Object.keys(TYPE_LABEL) as PortfolioItemType[]).map((t) => (
              <button
                key={t}
                onClick={() => setFormType(t)}
                className={`px-4 py-1.5 font-medium transition-colors ${formType === t ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"}`}
              >
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 flex flex-wrap items-end gap-4">
          {formType !== "funding" && (
            <>
              <div className="flex-1 min-w-48">
                <label className={fieldLabelCls}>이름</label>
                <input
                  placeholder={formType === "interest" ? "예: 파킹통장, USDC 예치" : "예: 월급, 상가 월세"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div>
                <label className={fieldLabelCls}>통화</label>
                <div className="flex rounded-lg overflow-hidden border border-hl-border text-sm">
                  {(["KRW", "USD"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCurrency(c)}
                      className={`px-4 py-2.5 font-mono transition-colors ${currency === c ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"}`}
                    >
                      {c === "KRW" ? "₩" : "$"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {formType === "interest" && (
            <>
              <div>
                <label className={fieldLabelCls}>원금</label>
                <input
                  inputMode="decimal"
                  placeholder="300,000,000"
                  value={principalRaw}
                  onChange={(e) => setPrincipalRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
                  className={`${inputCls} w-44 text-right`}
                />
              </div>
              <div>
                <label className={fieldLabelCls}>연이율 %</label>
                <input
                  inputMode="decimal"
                  placeholder="3.5"
                  value={aprRaw}
                  onChange={(e) => setAprRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                  className={`${inputCls} w-28 text-right`}
                />
              </div>
              <div>
                <label className={fieldLabelCls}>종목 APR 불러오기</label>
                <select
                  onChange={(e) => {
                    const a = symbolAprs[e.target.value];
                    if (a != null && Number.isFinite(a)) setAprRaw(a.toFixed(1));
                  }}
                  defaultValue=""
                  className={`${inputCls} min-w-44`}
                >
                  <option value="" disabled>선택…</option>
                  {symbols.map((t) => (
                    <option key={t.hlSymbol} value={t.hlSymbol}>
                      {t.krName} {symbolAprs[t.hlSymbol] != null ? `${symbolAprs[t.hlSymbol].toFixed(1)}%` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {formType === "income" && (
            <>
              <div>
                <label className={fieldLabelCls}>월 금액</label>
                <input
                  inputMode="decimal"
                  placeholder="3,000,000"
                  value={monthlyRaw}
                  onChange={(e) => setMonthlyRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
                  className={`${inputCls} w-44 text-right`}
                />
              </div>
              <div>
                <label className={fieldLabelCls}>원금 · 선택 (부동산 투자금 등)</label>
                <input
                  inputMode="decimal"
                  placeholder="비워도 됨"
                  value={principalRaw}
                  onChange={(e) => setPrincipalRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
                  className={`${inputCls} w-52 text-right`}
                />
              </div>
            </>
          )}

          {formType === "funding" && (
            <>
              <div className="flex-1 min-w-64 text-sm text-hl-text-secondary leading-relaxed">
                투입자본(HL 예치금 + 현물 원금)과 예상 APR을 실시간으로 가져와.
                {fundingCtx != null && (
                  <div className="mt-1 font-mono text-hl-text-primary">
                    지금 <span className="text-hl-accent">{formatUsd(fundingCtx.capitalUsd)}</span> ×{" "}
                    <span className="text-hl-accent">{fundingCtx.aprPct.toFixed(1)}%</span>
                  </div>
                )}
                {hasFundingItem && (
                  <div className="mt-1 text-hl-yellow/80">이미 펀딩파밍 항목이 있어 — 중복 추가 주의</div>
                )}
              </div>
              <div>
                <label className={fieldLabelCls}>이율 고정 % · 선택</label>
                <input
                  inputMode="decimal"
                  placeholder="비우면 라이브"
                  value={aprRaw}
                  onChange={(e) => setAprRaw(e.target.value.replace(/[^0-9.]/g, ""))}
                  className={`${inputCls} w-36 text-right`}
                />
              </div>
            </>
          )}

          <button
            onClick={submit}
            className="px-6 py-2.5 rounded-lg bg-hl-accent/20 text-hl-accent text-sm font-semibold hover:bg-hl-accent/30 transition-colors"
          >
            + 추가
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
