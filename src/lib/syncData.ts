/** 기기 간 데이터 동기화 — localStorage(hypurr_·hlbot_ 접두사)를 코드 하나로
 *  내보내고 다른 기기에서 가져온다. 서버 저장소가 없으므로(모두 localStorage)
 *  데스크톱에서 입력한 매매장부·페어가 폰에는 없다 → 이 코드로 옮긴다. */

const PREFIXES = ["hypurr_", "hlbot_"];
/** 파생 캐시 — 다시 쌓이는 데이터라 옮길 필요 없음 (용량만 커짐) */
const EXCLUDE = new Set(["hlbot_premium_history"]);

export interface SyncPayload {
  v: 1;
  exportedAt: number;
  data: Record<string, string>;
}

export function isSyncKey(key: string): boolean {
  return PREFIXES.some((p) => key.startsWith(p)) && !EXCLUDE.has(key);
}

export function collectSyncData(): SyncPayload {
  const data: Record<string, string> = {};
  if (typeof window !== "undefined") {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isSyncKey(key)) {
        const v = localStorage.getItem(key);
        if (v != null) data[key] = v;
      }
    }
  }
  return { v: 1, exportedAt: Date.now(), data };
}

type Row = Record<string, unknown>;

function identityKeyOf(list: unknown[]): string | null {
  for (const candidate of ["id", "address"]) {
    if (
      list.length > 0 &&
      list.every(
        (item) =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Row)[candidate] === "string"
      )
    )
      return candidate;
  }
  return null;
}

/** 스토어 값 병합 (순수 함수) —
 *  둘 다 id/address 있는 객체 배열이면 union(가져온 쪽 우선, 이 기기 전용 항목 보존),
 *  아니면 가져온 값으로 교체. */
export function mergeStoreValue(existingRaw: string | null, incomingRaw: string): string {
  if (existingRaw == null) return incomingRaw;
  try {
    const existing = JSON.parse(existingRaw);
    const incoming = JSON.parse(incomingRaw);
    if (Array.isArray(existing) && Array.isArray(incoming)) {
      const key = identityKeyOf(incoming) ?? identityKeyOf(existing);
      if (key != null) {
        const seen = new Set(
          incoming.map((item) => String((item as Row)[key]).toLowerCase())
        );
        const localOnly = existing.filter(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            !seen.has(String((item as Row)[key]).toLowerCase())
        );
        return JSON.stringify([...incoming, ...localOnly]);
      }
    }
  } catch {
    // JSON이 아니면 그대로 교체
  }
  return incomingRaw;
}

/** payload를 이 기기 localStorage에 병합 적용. 적용된 키 목록 반환. */
export function applySyncPayload(payload: SyncPayload): string[] {
  const applied: string[] = [];
  for (const [key, incoming] of Object.entries(payload.data)) {
    if (!isSyncKey(key)) continue; // 조작된 payload가 다른 키를 덮어쓰지 못하게
    localStorage.setItem(key, mergeStoreValue(localStorage.getItem(key), incoming));
    applied.push(key);
  }
  return applied;
}

/** 사람이 읽을 요약 — key별 항목 수 (배열이 아니면 null) */
export function summarizePayload(payload: SyncPayload): { key: string; count: number | null }[] {
  return Object.entries(payload.data)
    .map(([key, raw]) => {
      try {
        const v = JSON.parse(raw);
        return { key, count: Array.isArray(v) ? v.length : null };
      } catch {
        return { key, count: null };
      }
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/* ---------- 인코딩: JSON → gzip(가능하면) → base64url ---------- */

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function pipeThrough(
  bytes: Uint8Array,
  stream: ReadableWritablePair<Uint8Array, BufferSource>
): Promise<Uint8Array> {
  const readable = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(readable).arrayBuffer());
}

/** payload → 이동 가능한 코드 문자열. "1." = gzip, "0." = 무압축. */
export async function encodeSyncPayload(payload: SyncPayload): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== "undefined") {
    const gz = await pipeThrough(raw, new CompressionStream("gzip"));
    return `1.${bytesToBase64Url(gz)}`;
  }
  return `0.${bytesToBase64Url(raw)}`;
}

/** 코드 문자열(또는 코드가 든 URL) → payload. 형식이 아니면 throw. */
export async function decodeSyncPayload(input: string): Promise<SyncPayload> {
  let code = input.trim();
  const hashIdx = code.indexOf("#d=");
  if (hashIdx >= 0) code = code.slice(hashIdx + 3);
  const dot = code.indexOf(".");
  if (dot !== 1) throw new Error("동기화 코드 형식이 아니야");
  const mode = code.slice(0, 1);
  const bytes = base64UrlToBytes(code.slice(2));
  const raw =
    mode === "1" ? await pipeThrough(bytes, new DecompressionStream("gzip")) : bytes;
  const parsed = JSON.parse(new TextDecoder().decode(raw)) as SyncPayload;
  if (parsed.v !== 1 || typeof parsed.data !== "object" || parsed.data == null)
    throw new Error("지원하지 않는 동기화 코드 버전");
  return parsed;
}
