# Arb Funding 수익 기록 페이지 (`/arb/history`) 설계

날짜: 2026-07-22
상태: 승인됨 (사용자 승인 완료)
참고 레퍼런스: changwoo.vercel.app (기능 구성), app.hyperliquid.xyz 트레이드 UI (디자인 언어)

## 배경 / 목적

현재 `/arb`는 스캐너 + 원장(포지션 존재 여부) 중심이라 **실제로 펀딩비가 얼마나 들어왔는지**의
시계열 기록이 없다. changwoo.vercel.app 스타일의 "펀딩 수익 기록" 대시보드를 별도 페이지로 추가한다.

changwoo 사이트 분석 결과 (JS 번들 + `/api/funding`, `/api/live` 응답 확인):

- 스탯: 누적 펀딩 수익(시작일·N일째), 자본 대비 연 APR, 누적 수익률, 정산 횟수,
  현재 투입 자본(입출금 N건 반영), 현물 원금(억/만원), HL 예치금, 적용 환율, 직전/다음 펀비
- 테이블: 월별(월|펀딩피|수익률|연APR), 일별(동일 컬럼, 더보기/접기), 시간별(시각|코인|펀딩률|펀딩피)

## 스코프

**포함**: 스탯 카드 그리드, 월별/일별/시간별 기록 테이블, 직전 펀비 / 다음 펀비 예상,
입출금 기록 관리 UI (하이브리드 자본 기록).

**제외** (YAGNI): 보유 수량 환산 시뮬레이터, 트롤박스 채팅, 서버 DB / 다계정 공유.

## 아키텍처 결정

**클라이언트 전용 (기존 arb 탭과 동일 구조).**

- 펀딩 이력: HL `userFunding` API 직접 조회. 원본이 체인에 있으므로 유실 위험 없음.
- 입출금 장부: localStorage (`hypurr_arb_capital_events`).
- 서버/DB 없음. 필요해지면 JSON export/import로 확장 (추후).

기각한 대안: changwoo식 서버 API + Vercel KV (셋업 비용 + 지갑주소 서버 이전 부담),
export/import 동봉안 (추후 확장으로 미룸).

## 자본 기록 방식 (하이브리드 — 사용자 선택)

- **현물 원금**: 활성 페어 `krLeg.quantity × avgPriceKrw` 합계 (자동). ₩억/만원 표기.
- **HL 예치금**: 페어 지갑별 `clearinghouseState.accountValue` — 일반 perp + `xyz` dex 합산, 실시간 (자동).
- **현재 투입 자본** = HL 예치금 + 현물 원금(하나은행 환율로 USD 환산) + 수동 입출금 조정 합계.
- **입출금 장부**: 수동 기록 {일시, 구분(HL/국내/기타), 금액(±USD), 메모}. 자본 변동 이력 추적 +
  체인에 안 보이는 자금(대기 자금 등) 보정용. 카드에 "입출금 N건 기록" 표시.

## 화면 구성 (위 → 아래)

HL 트레이드 UI 스타일: 기존 `hl-*` 디자인 토큰 (다크 네이비 배경, 틸 악센트, 모노 숫자) 유지,
촘촘한 데이터 테이블 위주.

1. **스탯 카드 그리드** (2×4, 모바일 2열)
   - 누적 펀딩 수익 — 부제 "M/D 시작 · N일째 · 정산 N회"
   - 자본 대비 연 APR (실효) — 부제 누적 수익률. 기존 APR 기준 토글(전체자본/HL만) 존중
   - 직전 펀비 — 마지막 정산 시간대 합계
   - 다음 펀비 예상 — Σ(fundingHourly × 노셔널) + 정시까지 카운트다운 (HL 펀딩은 매시 정각)
   - 현재 투입 자본 — "입출금 N건 기록"
   - 현물 원금 — ₩억/만원
   - HL 예치금 — 실시간
   - 적용 환율 — 하나은행 USD/KRW
2. **월별 기록**: 월 | 펀딩피 | 수익률 | 연 APR
3. **일별 기록**: 날짜 | 펀딩피 | 수익률 | 연 APR — 기본 최근 14일, 더보기/접기
4. **시간별 기록**: 시각 | 코인 | 펀딩률 | 펀딩피 — 정산 이벤트 원본, 기본 48건 + 더보기.
   HL이 과거 이벤트를 합산 반환하면 (`nSamples > 1`) "Nh 합산" 배지 표시
5. **입출금 기록 관리**: 입력 폼(일시·구분·금액±·메모) + 목록 + 삭제 + 순입금 합계

## 데이터 / 계산 규칙

- **대상 페어**: 청산 포함 전체. 페어별 `[openedAt, closedAt ?? now]` 구간 & 심볼로 이벤트 필터
  (기존 `pairOpenedAt`, 심볼 매칭은 `xyz:` 프리픽스 유무 모두 허용 — arb/page.tsx 로직 재사용).
- **펀딩 이력 페이지네이션**: `userFunding`은 호출당 최대 500건 → 커서 루프
  (`startTime = last.time + 1`) 추가. 현행 코드는 잘림 위험 있음. 60초 캐시 유지.
- **수익률(구간)** = 구간 펀딩피 ÷ 현재 자본(기준 토글 적용) × 100.
- **연 APR(구간)** = 구간 수익률을 실제 경과 시간으로 연환산.
  완결 일 = ×365, 완결 월 = ×(365/월일수). 진행 중 구간(오늘/이번 달)은 경과 시간만으로 환산.
- 자본은 시점별 재구성 없이 **현재 자본**을 분모로 사용 (changwoo와 동일한 단순화 — 한계로 명시).
- 갱신: 펀딩 이벤트 60초, 시세/예치금 스냅샷 주기(5초)와 분리. 기존 rate limiter 준수.
- 모든 수익률 gross (수수료·거래세·환전 스프레드 미반영) — 푸터에 기존 문구 유지.

## 구현 파일

| 파일 | 작업 |
| --- | --- |
| `src/app/arb/history/page.tsx` | 새 페이지 (조립) |
| `src/app/arb/history/StatGrid.tsx` | 스탯 카드 그리드 |
| `src/app/arb/history/PeriodTable.tsx` | 월별/일별 공용 테이블 |
| `src/app/arb/history/HourlyTable.tsx` | 시간별 이벤트 테이블 |
| `src/app/arb/history/CapitalLedger.tsx` | 입출금 관리 UI |
| `src/lib/capitalStore.ts` | 입출금 localStorage store (arbStore 패턴) |
| `src/lib/hyperliquid.ts` | `getUserFundingAll` 페이지네이션 추가 |
| `src/lib/arb.ts` | 구간 수익률/연 APR 헬퍼 추가 |
| `src/components/Sidebar.tsx` | "Funding 기록" 메뉴 추가 |
| `tests/` | 집계·APR 헬퍼 vitest |

## 에러 처리

- 환율 조회 실패 → APR/원화 환산 카드에 "환율 조회 실패" 안내 (changwoo 동일 패턴).
- userFunding 실패 → 지갑별 개별 실패 허용 (기존 Promise.all + catch 패턴), 경고 배너.
- 입출금 장부 파싱 실패 → 빈 배열 fallback (arbStore 패턴).

## 테스트

- `aggregateFundingByPeriod` 확장분(수익률/APR 컬럼 계산, 진행 중 구간 연환산) 단위 테스트.
- `capitalStore` add/remove/합계.
- 페이지네이션 커서 로직 (mock fetch).
