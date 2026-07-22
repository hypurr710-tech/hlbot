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
import { formatUsd, groupDigits, pnlColor } from "@/lib/format";

const VENUE_LABEL: Record<CapitalVenue, string> = {
  hl: "HL",
  kr: "국내",
  other: "기타",
};

interface Props {
  /** 추가/삭제 후 부모가 자본 스탯을 다시 읽도록 알림 */
  onChange: () => void;
}

export default function CapitalLedger({ onChange }: Props) {
  const [events, setEvents] = useState<CapitalEvent[]>([]);
  const [venue, setVenue] = useState<CapitalVenue>("hl");
  const [amountRaw, setAmountRaw] = useState("");
  const [isWithdraw, setIsWithdraw] = useState(false);
  const [memo, setMemo] = useState("");
  const [dateStr, setDateStr] = useState(""); // yyyy-MM-dd, 빈 값이면 오늘

  useEffect(() => { setEvents(loadCapitalEvents()); }, []);

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

  const sorted = [...events].sort((a, b) => b.ts - a.ts);
  const net = netFlowUsd(events);

  return (
    <div className="bg-hl-bg-secondary border border-hl-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-hl-border flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-hl-text-primary">입출금 기록</h3>
        <span className={`text-[11px] font-mono ${pnlColor(net)}`}>
          순입금 {formatUsd(net)} · {events.length}건
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
          {(Object.keys(VENUE_LABEL) as CapitalVenue[]).map((v) => (
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
      </div>

      {sorted.length === 0 ? (
        <div className="h-16 flex items-center justify-center text-xs text-hl-text-tertiary">
          기록 없음 — 기타(대기자금)만 투입 자본에 가산되고, HL/국내 건은 이력용
        </div>
      ) : (
        <table className="w-full text-xs font-mono">
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className="border-t border-hl-border/50 hover:bg-hl-bg-hover transition-colors">
                <td className="px-4 py-1.5 text-hl-text-secondary">
                  {new Date(e.ts).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                </td>
                <td className="px-2 py-1.5 text-hl-text-tertiary">{VENUE_LABEL[e.venue]}</td>
                <td className={`px-2 py-1.5 text-right ${pnlColor(e.amountUsd)}`}>{formatUsd(e.amountUsd)}</td>
                <td className="px-2 py-1.5 text-hl-text-tertiary truncate max-w-40">{e.memo ?? ""}</td>
                <td className="px-4 py-1.5 text-right">
                  <button
                    onClick={() => { removeCapitalEvent(e.id); refresh(); }}
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
