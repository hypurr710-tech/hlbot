"use client";
import { useEffect, useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { useLiveSnapshot } from "@/app/arb/useLiveSnapshot";
import { loadTickerMap } from "@/lib/tickerMap";
import { decomposePremium, selectLiveKrPrice } from "@/lib/arb";
import { recordPremiumSample, getPremiumHistory } from "@/lib/premiumHistory";
import { pnlColor } from "@/lib/format";

const C = {
  ap: "#4a9eff",   // app premium — blue
  ki: "#a78bfa",   // kimchi — purple
  sb: "#50e3c2",   // stock basis — teal (the signal)
  grid: "#1e2a36",
  axis: "#546678",
  bg: "#151a21",
};

function fmtTime(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

interface CurRow {
  symbol: string;
  name: string;
  appPremium: number;
  kimchi: number;
  stockBasis: number;
}

export default function PremiumPage() {
  const { snapshot, error, lastUpdated } = useLiveSnapshot();
  const [selected, setSelected] = useState<string>("");
  const [version, setVersion] = useState(0);

  const symbols = useMemo(() => loadTickerMap(), []);

  // Current decomposition for every mapped symbol.
  const rows = useMemo<CurRow[]>(() => {
    if (!snapshot || snapshot.fx.usdtKrwUpbit == null || snapshot.fx.usdKrwHana == null) return [];
    const out: CurRow[] = [];
    for (const t of symbols) {
      const hl = snapshot.hl[t.hlSymbol];
      const kr = snapshot.kr[t.hlSymbol];
      if (!hl || !kr) continue;
      const d = decomposePremium({
        hlMarkUsd: hl.markPx,
        usdtKrw: snapshot.fx.usdtKrwUpbit,
        usdKrw: snapshot.fx.usdKrwHana,
        krPriceKrw: selectLiveKrPrice(kr),
      });
      out.push({ symbol: t.hlSymbol, name: t.krName, ...d });
    }
    return out.sort((a, b) => Math.abs(b.stockBasis) - Math.abs(a.stockBasis));
  }, [snapshot, symbols]);

  // Default selection = biggest current |stock basis|.
  useEffect(() => {
    if (!selected && rows.length > 0) setSelected(rows[0].symbol);
  }, [rows, selected]);

  // Record a sample per symbol whenever a fresh snapshot arrives.
  useEffect(() => {
    if (!snapshot) return;
    for (const r of rows) {
      recordPremiumSample(r.symbol, { t: snapshot.ts, ap: r.appPremium, ki: r.kimchi, sb: r.stockBasis });
    }
    setVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.ts]);

  const cur = rows.find((r) => r.symbol === selected);

  const chartData = useMemo(() => {
    if (!selected) return [];
    const hist = getPremiumHistory(selected).map((s) => ({ t: s.t, ap: s.ap, ki: s.ki, sb: s.sb }));
    if (cur && snapshot) {
      const last = hist[hist.length - 1];
      if (!last || snapshot.ts - last.t > 1000) {
        hist.push({ t: snapshot.ts, ap: cur.appPremium, ki: cur.kimchi, sb: cur.stockBasis });
      }
    }
    return hist;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, version, snapshot?.ts]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">Premium Radar</h1>
          <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
            앱 프리미엄을 <span style={{ color: C.sb }}>주식 베이시스</span> + <span style={{ color: C.ki }}>USDT 김프</span>로 분해해 추적
          </p>
        </div>
        {lastUpdated && (
          <div className="text-[11px] text-hl-text-tertiary font-mono">
            {error ? "연결 오류" : `LIVE · ${fmtTime(lastUpdated)}`}
          </div>
        )}
      </div>

      {/* Symbol selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {rows.map((r) => (
          <button
            key={r.symbol}
            onClick={() => setSelected(r.symbol)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
              selected === r.symbol
                ? "bg-hl-accent/15 border-hl-accent/40 text-hl-accent"
                : "bg-hl-bg-secondary border-hl-border text-hl-text-secondary hover:text-hl-text-primary hover:border-hl-border-light"
            }`}
          >
            {r.name}
            <span className={`ml-2 font-mono ${pnlColor(r.stockBasis)}`}>
              {r.stockBasis >= 0 ? "+" : ""}{r.stockBasis.toFixed(2)}%
            </span>
          </button>
        ))}
        {rows.length === 0 && (
          <span className="text-sm text-hl-text-tertiary">데이터 로딩 중…</span>
        )}
      </div>

      {/* Current decomposition tiles */}
      {cur && (
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          <Tile label="주식 베이시스" hint="종목 고유 (알림 대상)" value={cur.stockBasis} color={C.sb} big />
          <Tile label="USDT 김프" hint="모든 종목 공통 (FX)" value={cur.kimchi} color={C.ki} />
          <Tile label="앱 프리미엄" hint="= 베이시스 + 김프" value={cur.appPremium} color={C.ap} />
        </div>
      )}

      {/* Chart */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-hl-text-primary">
            {cur ? `${cur.name} 프리미엄 추이` : "프리미엄 추이"}
          </h2>
          <span className="text-[11px] text-hl-text-tertiary">{chartData.length}개 샘플 · 최대 24h</span>
        </div>
        {chartData.length < 2 ? (
          <div className="h-64 flex flex-col items-center justify-center text-sm text-hl-text-tertiary gap-1">
            <span>이력을 쌓는 중… (1분마다 1점)</span>
            <span className="text-xs text-hl-text-tertiary/70">이 탭을 열어두면 추이가 그려집니다</span>
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10, fill: C.axis }}
                  axisLine={{ stroke: C.grid }}
                  tickLine={false}
                  tickFormatter={fmtTime}
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: C.axis }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickFormatter={(v) => `${v}%`}
                />
                <ReferenceLine y={0} stroke={C.grid} strokeWidth={1} />
                <Tooltip
                  contentStyle={{ background: C.bg, border: `1px solid ${C.grid}`, borderRadius: 6, fontSize: 11 }}
                  labelFormatter={(v) => fmtTime(Number(v))}
                  formatter={(value: number | undefined, name) => [`${(value ?? 0).toFixed(3)}%`, String(name ?? "")]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="sb" name="주식 베이시스" stroke={C.sb} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="ki" name="USDT 김프" stroke={C.ki} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
                <Line type="monotone" dataKey="ap" name="앱 프리미엄" stroke={C.ap} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* All symbols table */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-hl-border text-sm font-semibold text-hl-text-primary">
          전체 종목 (주식 베이시스 큰 순)
        </div>
        <div className="divide-y divide-hl-border/60">
          {rows.map((r) => (
            <button
              key={r.symbol}
              onClick={() => setSelected(r.symbol)}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-hl-bg-hover/50 transition-colors ${
                selected === r.symbol ? "bg-hl-accent/5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-hl-text-primary font-medium">{r.name}</span>
                <span className="text-xs font-mono text-hl-text-tertiary">{r.symbol}</span>
              </div>
              <div className="flex items-center gap-4 font-mono text-xs tabular-nums">
                <span className={`font-bold ${pnlColor(r.stockBasis)}`}>
                  베이시스 {r.stockBasis >= 0 ? "+" : ""}{r.stockBasis.toFixed(2)}%
                </span>
                <span className="text-hl-text-tertiary hidden sm:inline" style={{ color: C.ki }}>
                  김프 {r.kimchi >= 0 ? "+" : ""}{r.kimchi.toFixed(2)}%
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, hint, value, color, big }: { label: string; hint: string; value: number; color: string; big?: boolean }) {
  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-3 md:p-4">
      <div className="text-[10px] md:text-[11px] uppercase tracking-wider" style={{ color }}>{label}</div>
      <div className={`font-mono font-bold tabular-nums ${pnlColor(value)} ${big ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"}`}>
        {value >= 0 ? "+" : ""}{value.toFixed(2)}%
      </div>
      <div className="text-[10px] text-hl-text-tertiary mt-0.5">{hint}</div>
    </div>
  );
}
