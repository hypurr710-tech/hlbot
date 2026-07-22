"use client";
import { useCallback, useEffect, useState } from "react";
import {
  collectSyncData,
  encodeSyncPayload,
  decodeSyncPayload,
  applySyncPayload,
  summarizePayload,
  type SyncPayload,
} from "@/lib/syncData";

const STORE_LABEL: Record<string, string> = {
  hlbot_addresses: "지갑 주소",
  hypurr_arb_pairs: "델타중립 페어",
  hypurr_arb_spot_trades: "현물 매매장부",
  hypurr_arb_capital_events: "입출금 기록",
  hlbot_apr_basis: "APR 기준 설정",
  hypurr_portfolio_profiles: "포트폴리오 프로필",
  hypurr_portfolio_active_profile: "활성 프로필",
};

function storeLabel(key: string): string {
  if (STORE_LABEL[key]) return STORE_LABEL[key];
  if (key.startsWith("hypurr_portfolio_items")) return "포트폴리오 항목";
  return key;
}

export default function SyncPage() {
  const [exportCode, setExportCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importInput, setImportInput] = useState("");
  const [pending, setPending] = useState<SyncPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [localSummary, setLocalSummary] = useState<{ key: string; count: number | null }[]>([]);

  // localStorage는 클라이언트 전용 — 마운트 후 읽어 하이드레이션 불일치 방지
  useEffect(() => {
    setLocalSummary(summarizePayload(collectSyncData()));
  }, [done]);

  // 데스크톱에서 만든 링크(#d=...)로 들어오면 바로 가져오기 미리보기
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#d=")) return;
    decodeSyncPayload(hash.slice(3))
      .then(setPending)
      .catch(() => setError("링크의 동기화 코드를 읽지 못했어 — 코드를 직접 붙여넣어 봐"));
  }, []);

  const makeLink = useCallback(async () => {
    const code = await encodeSyncPayload(collectSyncData());
    const url = `${window.location.origin}/sync#d=${code}`;
    setExportCode(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // 클립보드 권한이 없으면 화면의 코드를 수동 복사
    }
  }, []);

  const previewImport = useCallback(async () => {
    setError(null);
    try {
      setPending(await decodeSyncPayload(importInput));
    } catch {
      setError("동기화 코드를 읽지 못했어 — 링크 전체를 붙여넣어도 돼");
    }
  }, [importInput]);

  const applyImport = useCallback(() => {
    if (!pending) return;
    applySyncPayload(pending);
    setDone(true);
    setPending(null);
    // 스토어는 마운트 시 localStorage를 읽으므로 전체 리로드로 반영
    setTimeout(() => window.location.replace("/arb/history"), 1200);
  }, [pending]);

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold text-hl-text-primary">기기 동기화</h1>
        <p className="text-xs md:text-sm text-hl-text-secondary mt-1">
          매매장부·페어·입출금은 이 기기(브라우저)에만 저장돼 — 링크 하나로 다른 기기에 옮기자
        </p>
      </div>

      {done && (
        <div className="bg-hl-green/10 border border-hl-green/30 text-hl-green text-sm p-3 rounded-lg">
          ✓ 가져오기 완료 — 잠시 후 기록 페이지로 이동해
        </div>
      )}

      {/* 가져오기 미리보기 (링크로 진입했거나 코드 해석 성공 시) */}
      {pending && (
        <div className="bg-hl-bg-secondary border border-hl-accent/40 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-hl-text-primary">
            가져올 데이터{" "}
            <span className="text-[11px] text-hl-text-tertiary font-mono font-normal">
              {new Date(pending.exportedAt).toLocaleString("ko-KR")} 내보냄
            </span>
          </h2>
          <ul className="text-xs font-mono text-hl-text-secondary space-y-1">
            {summarizePayload(pending).map(({ key, count }) => (
              <li key={key} className="flex justify-between gap-4">
                <span>{storeLabel(key)}</span>
                <span className="text-hl-text-tertiary">{count != null ? `${count}건` : "설정값"}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-hl-text-tertiary leading-relaxed">
            같은 항목은 가져온 쪽으로 갱신되고, 이 기기에만 있는 기록은 그대로 보존돼 (병합).
          </p>
          <div className="flex gap-2">
            <button
              onClick={applyImport}
              className="px-4 py-2 rounded-lg bg-hl-accent/20 text-hl-accent hover:bg-hl-accent/30 text-sm font-medium transition-colors"
            >
              가져오기 (병합)
            </button>
            <button
              onClick={() => setPending(null)}
              className="px-4 py-2 rounded-lg text-sm text-hl-text-secondary hover:text-hl-text-primary transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 내보내기 */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-hl-text-primary">이 기기 → 다른 기기</h2>
        <ul className="text-xs font-mono text-hl-text-secondary space-y-1">
          {localSummary.length === 0 ? (
            <li className="text-hl-text-tertiary">이 기기에 저장된 데이터 없음</li>
          ) : (
            localSummary.map(({ key, count }) => (
              <li key={key} className="flex justify-between gap-4">
                <span>{storeLabel(key)}</span>
                <span className="text-hl-text-tertiary">{count != null ? `${count}건` : "설정값"}</span>
              </li>
            ))
          )}
        </ul>
        <button
          onClick={makeLink}
          className="px-4 py-2 rounded-lg bg-hl-accent/20 text-hl-accent hover:bg-hl-accent/30 text-sm font-medium transition-colors"
        >
          {copied ? "✓ 링크 복사됨" : "동기화 링크 만들기 + 복사"}
        </button>
        {exportCode && (
          <div className="space-y-1.5">
            <p className="text-[11px] text-hl-text-tertiary">
              이 링크를 카톡 나에게 보내기 등으로 폰에 전달하고, 폰에서 열면 돼.
            </p>
            <textarea
              readOnly
              value={exportCode}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full h-24 bg-hl-bg-tertiary border border-hl-border rounded-lg p-2 text-[11px] font-mono text-hl-text-secondary break-all resize-none outline-none"
            />
          </div>
        )}
      </div>

      {/* 코드로 가져오기 */}
      <div className="bg-hl-bg-secondary border border-hl-border rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-hl-text-primary">코드 붙여넣어 가져오기</h2>
        {error && <p className="text-xs text-hl-red">{error}</p>}
        <textarea
          value={importInput}
          onChange={(e) => setImportInput(e.target.value)}
          placeholder="다른 기기에서 만든 동기화 링크(또는 코드)를 붙여넣기"
          className="w-full h-24 bg-hl-bg-tertiary border border-hl-border rounded-lg p-2 text-[11px] font-mono text-hl-text-primary placeholder:text-hl-text-tertiary resize-none outline-none focus:border-hl-border-light"
        />
        <button
          onClick={previewImport}
          disabled={importInput.trim() === ""}
          className="px-4 py-2 rounded-lg bg-hl-accent/20 text-hl-accent hover:bg-hl-accent/30 disabled:opacity-40 text-sm font-medium transition-colors"
        >
          코드 확인
        </button>
      </div>
    </div>
  );
}
