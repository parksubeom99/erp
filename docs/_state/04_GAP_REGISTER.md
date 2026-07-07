# STEP 3 — 갭 레지스터

> 분류: `[DECIDE]` 회장님 결정 · `[BUILD]` 구현 필요 · `[VERIFY]` 실행 확인 필요 · `[OK]` 정합. 각 갭에 출처.

## [DECIDE] — 회장님 결정

| # | 갭 | 근거 | 권장(엘/CC, 단정 아님) |
|---|---|---|---|
| D1 | **EDIM(대문자) vs edlm(소문자) 작업 기준 통일** — 물리 재편을 실제 진행할지 | 00_STEP0 §2·§5, STRUCTURE.md("6 PR 병합 후 별건") | 병합 먼저 → 그 후 물리 재편 별건 |
| D2 | **PR 스택 병합 순서 착수** — skeleton PR이 없어 스택 전체가 main과 단절 | 00_STEP0 §3, PR분석 | skeleton→main PR 먼저(또는 base 재타겟) 후 #14→…→#18 bottom-up |
| D3 | **마이그레이션 0003 충돌** — #13 `0003_project` vs #18 `0003_macro_registry` | 01_INVENTORY §5 | 나중 병합본을 `0004_*`로 재번호 |
| D4 | **85-MD 코퍼스 버전관리** — repo 밖(SSOT인데 미커밋) | 01_INVENTORY §6 | `docs/corpus/`로 커밋 또는 참조 정본화 |
| D5 | **auth 프로바이더** — email-only dev seam, 프로덕션 전 실 프로바이더 확정 | lmd §6 | 프로덕션 착수 전 결정 |
| D6 | **NOVA 예약토큰(FES·Cos2·PreC) 의미** — Ian 회신 대기 | lmd §6, handoff P1 | 회신 시 "경고→실동작" 전환(진행 비차단) |
| D7 | **로컬 remote URL** erp→edim 갱신 | 00_STEP0 §1 | `git remote set-url` (사소·저위험) |

## [BUILD] — 구현 필요 (autonomous 아님 · 회장님 승인 후)

| # | 갭 | 근거 | 성격 |
|---|---|---|---|
| B1 | **STEP 6 — DB-backed DataProvider** (`edim run` 실데이터 실행, 고리 닫기) | 03_RECON §2, lmd §5 | 다음 프론티어(스키마 무변경, base=`ef34c37`) |
| B2 | **TS CI 배선** — ci.yml에 pnpm typecheck+vitest(+옵션 DB 매트릭스) | 02_TEST §3·§4 | 기존 파일 수정 → 별건 |
| B3 | **dry-run 실데이터 미리보기** — 현재 mock 한정, `verify.ts` 이음새 배선 | 01_INVENTORY §3, 03_RECON §2 | B1에 종속 |
| B4 | **STEP 7 — 런타임 승인 게이트 실행** | 03_RECON §2 | STEP 6 후속 |
| B5 | **L3 업무 로직** (CPQ 선정·BOM 전개·도면·원가) — 최대 공백대 | 03_RECON §4 | 대형·다PR |

## [VERIFY] — 실행해 확정

| # | 항목 | 근거 |
|---|---|---|
| V1 | vitest 실제 카운트 (macro-dsl 35 vs lmd 48, macro-registry 9 vs lmd 15 — 계수기준 차이 추정) | 02_TEST §2 |
| V2 | DB 게이트 3종(`db:rls:test`·`auth:test`·smoke) green — Docker Postgres 5433 기동 후 | 02_TEST §4, lmd §4 |
| V3 | Python 6 테스트 — `pip install -r requirements.txt`(ifcopenshell 포함) 후 green | 02_TEST §2 |
| V4 | 전 워크스페이스 `tsc --noEmit` clean (lmd 10/10 주장) | lmd §4 |

## [OK] — 정합 확인됨

- AI Macro STEP1~5: 흐름지도 #2 · 파트① · `packages/macro-*` 3자 정합 (03_RECON §4).
- 셸 L1/L2: 로드맵 · 흐름지도 #5 · `apps/web` 정합.
- 도메인↔패키지 매핑: STRUCTURE.md §2 ↔ 인벤토리 실측 일치.
- 순수/어댑터 규율: 순수 패키지 db/LLM import 0, 이음새는 apps/web에만 (01_INVENTORY §4).
- GitHub 위상: nmd/lmd 주장 = 실측 일치 (00_STEP0 §1).
