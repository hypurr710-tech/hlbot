/** 포트폴리오 현금흐름 계산기 — localStorage store + 순수 계산 로직. */

export type PortfolioItemType = "interest" | "income" | "funding";

export interface PortfolioItem {
  id: string;
  name: string;
  type: PortfolioItemType;
  currency: "KRW" | "USD";
  /** 이자형: 필수. 고정수입형: 선택(투자금 표시·APR 계산용). 펀딩파밍: 무시(라이브) */
  principal?: number;
  /** 이자형: 필수 연이율%. 펀딩파밍: 수동 오버라이드(비우면 라이브 예상 APR) */
  aprPct?: number;
  /** 고정수입형: 필수 월 금액 */
  monthlyAmount?: number;
  createdAt: number;
}

// ---- 프로필 (내꺼/아빠꺼 등 포트폴리오 여러 벌) ----

export interface PortfolioProfile {
  id: string;
  name: string;
}

const PROFILES_KEY = "hypurr_portfolio_profiles";
const ACTIVE_KEY = "hypurr_portfolio_active_profile";
/** 프로필 도입 전 데이터 — default 프로필의 저장 키로 그대로 사용 (마이그레이션 불필요) */
const LEGACY_ITEMS_KEY = "hypurr_portfolio_items";
export const DEFAULT_PROFILE_ID = "default";

function itemsKey(profileId: string): string {
  return profileId === DEFAULT_PROFILE_ID ? LEGACY_ITEMS_KEY : `${LEGACY_ITEMS_KEY}::${profileId}`;
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadProfiles(): PortfolioProfile[] {
  if (typeof window === "undefined") return [{ id: DEFAULT_PROFILE_ID, name: "내 포트폴리오" }];
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    const list = raw ? (JSON.parse(raw) as PortfolioProfile[]) : [];
    if (list.length === 0) return [{ id: DEFAULT_PROFILE_ID, name: "내 포트폴리오" }];
    return list;
  } catch {
    return [{ id: DEFAULT_PROFILE_ID, name: "내 포트폴리오" }];
  }
}

function writeProfiles(list: PortfolioProfile[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(PROFILES_KEY, JSON.stringify(list));
}

export function addProfile(name: string): PortfolioProfile {
  const p: PortfolioProfile = { id: genId(), name };
  writeProfiles([...loadProfiles(), p]);
  return p;
}

/** 프로필과 그 항목을 함께 삭제. 마지막 남은 프로필은 삭제 불가. */
export function removeProfile(id: string): void {
  const rest = loadProfiles().filter((p) => p.id !== id);
  if (rest.length === 0) return;
  writeProfiles(rest);
  if (typeof window !== "undefined") localStorage.removeItem(itemsKey(id));
  if (getActiveProfileId() === id) setActiveProfileId(rest[0].id);
}

export function getActiveProfileId(): string {
  if (typeof window === "undefined") return DEFAULT_PROFILE_ID;
  const id = localStorage.getItem(ACTIVE_KEY);
  if (id && loadProfiles().some((p) => p.id === id)) return id;
  return loadProfiles()[0]?.id ?? DEFAULT_PROFILE_ID;
}

export function setActiveProfileId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_KEY, id);
}

// ---- 항목 store (프로필별) ----

function read(profileId: string): PortfolioItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(itemsKey(profileId));
    return raw ? (JSON.parse(raw) as PortfolioItem[]) : [];
  } catch {
    return [];
  }
}

function write(profileId: string, list: PortfolioItem[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(itemsKey(profileId), JSON.stringify(list));
}

export function loadPortfolioItems(profileId: string = DEFAULT_PROFILE_ID): PortfolioItem[] {
  return read(profileId);
}

export function addPortfolioItem(
  input: Omit<PortfolioItem, "id" | "createdAt">,
  profileId: string = DEFAULT_PROFILE_ID
): PortfolioItem {
  const item: PortfolioItem = { ...input, id: genId(), createdAt: Date.now() };
  write(profileId, [...read(profileId), item]);
  return item;
}

export function removePortfolioItem(id: string, profileId: string = DEFAULT_PROFILE_ID): void {
  write(profileId, read(profileId).filter((i) => i.id !== id));
}

export interface PortfolioRow {
  id: string;
  name: string;
  type: PortfolioItemType;
  /** null = 환율/라이브 데이터 대기로 계산 불가 (합계에서 제외) */
  principalKrw: number | null;
  aprPct: number | null;
  monthlyKrw: number | null;
  yearlyKrw: number | null;
  /** 펀딩파밍 라이브 값 사용 여부 (오버라이드 없을 때) */
  auto: boolean;
}

export interface PortfolioTotals {
  principalKrw: number;
  monthlyKrw: number;
  yearlyKrw: number;
  /** 원금 있는 항목들만의 연 수익 ÷ 원금 (근로소득 등 원금 없는 항목 제외) */
  weightedAprPct: number;
}

export interface PortfolioCtx {
  /** USD/KRW 환율 (하나은행). null이면 USD 항목 계산 불가 */
  usdKrw: number | null;
  /** 펀딩파밍 라이브: 투입자본(USD)과 예상 APR%. null이면 펀딩 항목 계산 불가 */
  funding: { capitalUsd: number; aprPct: number } | null;
}

/** 항목들을 KRW 기준으로 평가해 행 + 합계를 만든다. */
export function computePortfolio(
  items: PortfolioItem[],
  ctx: PortfolioCtx
): { rows: PortfolioRow[]; totals: PortfolioTotals } {
  const toKrw = (amount: number, currency: "KRW" | "USD"): number | null => {
    if (currency === "KRW") return amount;
    return ctx.usdKrw != null && ctx.usdKrw > 0 ? amount * ctx.usdKrw : null;
  };

  const rows: PortfolioRow[] = items.map((item) => {
    if (item.type === "interest") {
      const principalKrw = item.principal != null ? toKrw(item.principal, item.currency) : null;
      const apr = item.aprPct ?? 0;
      const yearlyKrw = principalKrw != null ? (principalKrw * apr) / 100 : null;
      return {
        id: item.id, name: item.name, type: item.type,
        principalKrw, aprPct: apr,
        monthlyKrw: yearlyKrw != null ? yearlyKrw / 12 : null,
        yearlyKrw, auto: false,
      };
    }
    if (item.type === "income") {
      const monthlyKrw = item.monthlyAmount != null ? toKrw(item.monthlyAmount, item.currency) : null;
      const principalKrw = item.principal != null ? toKrw(item.principal, item.currency) : null;
      const yearlyKrw = monthlyKrw != null ? monthlyKrw * 12 : null;
      const aprPct =
        principalKrw != null && principalKrw > 0 && yearlyKrw != null
          ? (yearlyKrw / principalKrw) * 100
          : null;
      return {
        id: item.id, name: item.name, type: item.type,
        principalKrw, aprPct, monthlyKrw, yearlyKrw, auto: false,
      };
    }
    // funding — 라이브 자본 × (오버라이드 이율 ?? 라이브 예상 APR)
    const capitalKrw =
      ctx.funding != null && ctx.usdKrw != null && ctx.usdKrw > 0
        ? ctx.funding.capitalUsd * ctx.usdKrw
        : null;
    const apr = item.aprPct ?? ctx.funding?.aprPct ?? null;
    const yearlyKrw = capitalKrw != null && apr != null ? (capitalKrw * apr) / 100 : null;
    return {
      id: item.id, name: item.name, type: item.type,
      principalKrw: capitalKrw, aprPct: apr,
      monthlyKrw: yearlyKrw != null ? yearlyKrw / 12 : null,
      yearlyKrw, auto: item.aprPct == null,
    };
  });

  let principalKrw = 0;
  let monthlyKrw = 0;
  let yearlyKrw = 0;
  let aprYearlyKrw = 0; // 원금 있는 항목들의 연 수익만 — APR 분자
  for (const r of rows) {
    if (r.monthlyKrw != null) monthlyKrw += r.monthlyKrw;
    if (r.yearlyKrw != null) yearlyKrw += r.yearlyKrw;
    if (r.principalKrw != null && r.principalKrw > 0) {
      principalKrw += r.principalKrw;
      if (r.yearlyKrw != null) aprYearlyKrw += r.yearlyKrw;
    }
  }
  const weightedAprPct = principalKrw > 0 ? (aprYearlyKrw / principalKrw) * 100 : 0;

  return { rows, totals: { principalKrw, monthlyKrw, yearlyKrw, weightedAprPct } };
}
