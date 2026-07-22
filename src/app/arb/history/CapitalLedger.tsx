"use client";
import { useEffect, useState } from "react";
import {
  loadCapitalEvents,
  addCapitalEvent,
  removeCapitalEvent,
  netFlowUsd,
  type CapitalEvent,
  type CapitalVenue,
} from "@/lib/capitalStore";
import { getUserNonFundingLedgerUpdates } from "@/lib/hyperliquid";
import { formatUsd, groupDigits, pnlColor } from "@/lib/format";

const VENUE_LABEL: Record<CapitalVenue, string> = {
  hl: "HL",
  kr: "국내",
  other: "기타",
};

/** 수동 입력은 국내/기타만 — HL 입출금은 온체인에서 자동으로 가져온다. */
const MANUAL_VENUES: CapitalVenue[] = ["kr", "other"];

const ONE_YEAR_AGO = () => Date.now() - 365 * 24 * 60 * 60 * 1000;

interface AutoRow {
  id: string;
  ts: number;
  amountUsd: number;
  memo: string;
}

/** 지갑들의 HL 자금 이동을 정규화. 외부 입출금(deposit/withdraw)에 더해
 *  지갑 간 이체(internalTransfer 등 send/receive)도 포함 — perp↔spot 같은
 *  같은 지갑 내부 이동(accountClassTransfer)만 제외한다. */
async function fetchHlFlows(addresses: string[]): Promise<AutoRow[]> {
  const seen = new Set<string>();
  const out: AutoRow[] = [];
  const results = await Promise.all(
    addresses.map(async (a) => [a, await getUserNonFundingLedgerUpdates(a, ONE_YEAR_AGO()).catch(() => [])] as const)
  );
  for (const [addr, updates] of results) {
    for (const u of updates) {
      const t = u.delta.type;
      const d = u.delta as Record<string, unknown>;
      // 금액 필드가 유형마다 다름: deposit/withdraw는 usdc, send류는 amount
      const amt = Math.abs(parseFloat(String(d.usdc ?? d.amount ?? "0")));
      if (!Number.isFinite(amt) || amt === 0) continue;
      let signedAmt: number;
      let memo: string;
      if (t === "deposit") {
        signedAmt = amt;
        memo = "입금 · 온체인 자동";
      } else if (t === "withdraw") {
        signedAmt = -amt;
        memo = "출금 · 온체인 자동";
      } else if (
        t === "send" || t === "internalTransfer" || t === "subAccountTransfer" || t === "spotTransfer"
      ) {
        // USDC 이동만 자본으로 집계 (코인 전송은 금액 단위가 달라 제외)
        const token = String(d.token ?? "USDC");
        if (token !== "USDC") continue;
        // 수신자면 +, 발신자면 − (destination이 조회 지갑인지로 판별)
        const dest = String(d.destination ?? "").toLowerCase();
        const incoming = dest === addr.toLowerCase();
        signedAmt = incoming ? amt : -amt;
        memo = incoming ? "이체 수신 · 자동" : "이체 발신 · 자동";
      } else {
        continue; // accountClassTransfer(perp↔spot)·borrowLend(HLP 렌딩) 등 내부 이동은 제외
      }
      const key = `${addr}|${u.hash}|${u.time}|${t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ id: key, ts: u.time, amountUsd: signedAmt, memo });
    }
  }
  return out;
}

interface Props {
  /** HL 입출금을 자동 조회할 지갑들 (소문자) */
  addresses: string[];
  /** 추가/삭제 후 부모가 자본 스탯을 다시 읽도록 알림 */
  onChange: () => void;
}

export default function CapitalLedger({ addresses, onChange }: Props) {
  const [events, setEvents] = useState<CapitalEvent[]>([]);
  const [autoRows, setAutoRows] = useState<AutoRow[]>([]);
  const [autoLoading, setAutoLoading] = useState(true);
  const [venue, setVenue] = useState<CapitalVenue>("kr");
  const [amountRaw, setAmountRaw] = useState("");
  const [isWithdraw, setIsWithdraw] = useState(false);
  const [memo, setMemo] = useState("");
  const [dateStr, setDateStr] = useState(""); // yyyy-MM-dd, 빈 값이면 오늘

  useEffect(() => { setEvents(loadCapitalEvents()); }, []);

  const addressesKey = addresses.join(",");
  useEffect(() => {
    if (addresses.length === 0) { setAutoRows([]); setAutoLoading(false); return; }
    let cancelled = false;
    setAutoLoading(true);
    fetchHlFlows(addresses)
      .then((rows) => { if (!cancelled) setAutoRows(rows); })
      .finally(() => { if (!cancelled) setAutoLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressesKey]);

  const refresh = () => {
    setEvents(loadCapitalEvents());
    onChange();
  };

  const submit = () => {
    const amount = parseFloat(amountRaw.replace(/,/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) return;
    const ts = dateStr ? new Date(`${dateStr}T12:00:00`).getTime() : Date.now();
    addCapitalEvent({
      ts,
      venue,
      amountUsd: isWithdraw ? -amount : amount,
      memo: memo.trim() || undefined,
    });
    setAmountRaw("");
    setMemo("");
    refresh();
  };

  type Row =
    | { auto: true; id: string; ts: number; amountUsd: number; label: string; memo: string }
    | { auto: false; id: string; ts: number; amountUsd: number; label: string; memo: string };

  const rows: Row[] = [
    ...autoRows.map((r) => ({
      auto: true as const,
      id: r.id,
      ts: r.ts,
      amountUsd: r.amountUsd,
      label: "HL",
      memo: r.memo,
    })),
    ...events.map((e) => ({
      auto: false as const,
      id: e.id,
      ts: e.ts,
      amountUsd: e.amountUsd,
      label: VENUE_LABEL[e.venue],
      memo: e.memo ?? "",
    })),
  ].sort((a, b) => b.ts - a.ts);

  const net = netFlowUsd(events) + autoRows.reduce((s, r) => s + r.amountUsd, 0);

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">입출금 기록</h3>
        <span className={`text-[11px] font-mono ${pnlColor(net)}`}>
          순입금 {formatUsd(net)} · {rows.length}건
          {autoLoading && <span className="text-hl-text-tertiary"> · HL 조회 중…</span>}
        </span>
      </div>

      <div className="px-4 py-3 border-b border-hl-border flex flex-wrap items-center gap-2 text-xs">
        <input
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          className="bg-hl-bg-tertiary border border-hl-border rounded px-2 py-1 text-hl-text-primary font-mono"
        />
        <div className="flex rounded overflow-hidden border border-hl-border">
          {MANUAL_VENUES.map((v) => (
            <button
              key={v}
              onClick={() => setVenue(v)}
              className={`px-2 py-1 ${venue === v ? "bg-hl-accent/20 text-hl-accent" : "text-hl-text-secondary hover:bg-hl-bg-hover"}`}
            >
              {VENUE_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="flex rounded overflow-hidden border border-hl-border">
          {[false, true].map((w) => (
            <button
              key={String(w)}
              onClick={() => setIsWithdraw(w)}
              className={`px-2 py-1 ${isWithdraw === w ? (w ? "bg-hl-red/20 text-hl-red" : "bg-hl-green/20 text-hl-green") : "text-hl-text-secondary hover:bg-hl-bg-hover"}`}
            >
              {w ? "출금" : "입금"}
            </button>
          ))}
        </div>
        <input
          inputMode="decimal"
          placeholder="금액 (USD)"
          value={amountRaw}
          onChange={(e) => setAmountRaw(groupDigits(e.target.value.replace(/[^0-9.]/g, "")))}
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
        <span className="w-full text-[10px] text-hl-text-tertiary">
          HL 입출금은 온체인에서 자동으로 불러와져 — 수동 입력은 국내 증권사·기타(대기자금)용. 기타만 투입 자본에 가산
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="h-16 flex items-center justify-center text-xs text-hl-text-tertiary">
          {autoLoading ? "HL 온체인 입출금 조회 중…" : "기록 없음"}
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] text-xs font-mono">
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors">
                <td className="px-4 py-1.5 text-hl-text-secondary">
                  {new Date(r.ts).toLocaleDateString("ko-KR", { year: "2-digit", month: "numeric", day: "numeric" })}
                </td>
                <td className="px-2 py-1.5 text-hl-text-tertiary">
                  {r.label}
                  {r.auto && (
                    <span className="ml-1 px-1 py-px rounded bg-hl-bg-tertiary text-[9px] text-hl-accent/80">
                      자동
                    </span>
                  )}
                </td>
                <td className={`px-2 py-1.5 text-right ${pnlColor(r.amountUsd)}`}>{formatUsd(r.amountUsd)}</td>
                <td className="px-2 py-1.5 text-hl-text-tertiary truncate max-w-40">{r.memo}</td>
                <td className="px-4 py-1.5 text-right">
                  {!r.auto && (
                    <button
                      onClick={() => { removeCapitalEvent(r.id); refresh(); }}
                      className="text-hl-text-tertiary hover:text-hl-red transition-colors"
                      title="삭제"
                    >
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </div>
  );
}
