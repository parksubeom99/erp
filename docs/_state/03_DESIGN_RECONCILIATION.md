# STEP 3 — 3층 설계 정합 맵

> 세 출처를 잇는다: **(a) 코퍼스 흐름지도 v3**(회장님 손그림, `EDIM_diagram_PLM_v3.png`) · **(b) 파트① AI 트랙**(STEP 0→7) · **(c) 실제 코드**(01_INVENTORY). 인용은 실측 파일 기준.

## 1. 흐름지도 v3 → 도메인 → 코드 (5축)

흐름지도 v3의 5개 번호 클러스터(#1~#5)를 도메인 폴더·모노레포·구현 상태에 정합:

| v3 클러스터 | EDIM 도메인 | 모노레포 대응 | 구현 상태 |
|---|---|---|---|
| **#1 PLM (code system)** ← Main DB · code/drawing setup | `plm` | `packages/{hierarchy-address, core-ontology}` (주소/코드 기반) | 주소체계 O · **도면/코드시스템 L3 미구현** |
| **BOM (Price·drawing)** / CPQ(Code·tech data·drawing) | (CPQ 축) | — | **미구현** (L3 CPQ) |
| **#4 ERP (process) → processing** · 함수코드 data | `erp` | (미구현) | **미구현** (L3 ERP work process) |
| **#2 EDIM tool Box** — UI + Programing(**Native AI + Macro**), "Excel function 너머" | `toolbox/{UI_toolbox, programing_toolbox}` | `packages/ui` + `packages/macro-*` (dsl/verify/compile/registry) | **AI Macro 트랙 STEP1~5 구현** · UI O |
| **#3 near SI / AI 학습 / special program tool** (관리자 소유) | `administrator/{learning_AI, special_programing}` | (미구현, 파트②·③) | **미구현** |
| **#5 EDIM (Main form)** — CPQ·PLM·TLM·ERP 표, Hierarchy tree, 승인화면·SaaS business 통제 | `main_form` | `apps/web` (3패널 셸 + RBAC + 승인) | **L1/L2 셸 구현** · 업무패널(Main work) L3 placeholder |

> 근거: 매핑의 도메인↔패키지 대응은 기존 `edim/docs/STRUCTURE.md`(PR #19) §2와 일치. 본 문서는 여기에 **흐름지도 v3 시각 축**과 **구현 상태**를 덧댄 것.

## 2. 파트① AI 트랙 STEP 0→7 ↔ 코드

제1원칙("AI는 수식을 만들고, 수식만 실행된다")의 파이프라인 구현 상태:

| 파트① STEP | 정의 | 코드/PR | 상태 |
|---|---|---|---|
| STEP 0 | DSL 코어/문법 v1.0 | 독립 PR 없음 — #14 parser의 근거 스펙(SSOT)으로 흡수 | 스펙 확정(코드로는 #14에 내장) |
| STEP 1 | parser + 결정론 executor | `macro-dsl` · **#14** | ✅ 구현 |
| STEP 2 | 주소 resolver (`edim://`) | `hierarchy-address` · **#15** | ✅ 구현 |
| STEP 3 | A6 Verifier + Dry-run | `macro-verify` · **#16** | ✅ 구현(순환검사 no-op 이음새) |
| STEP 4 | LLM 번역(NL→DSL) **첫 AI** | `macro-compile` · **#17** | ✅ 구현(Claude Sonnet, temp0, 되먹임 ≤2) |
| STEP 5 | 승인 3단 + Registry(A7) | `macro-registry`+`db` · **#18** | ✅ 구현(RLS, 노드당 1 active) |
| STEP 6 | **파이프라인(실데이터 실행)** | 없음 | ❌ **미구현 — 다음 프론티어** |
| STEP 7 | 런타임 승인 게이트 실행 | 없음 | ❌ 미구현 |

**닫힌 고리 vs 열린 고리**: 설계타임 `자연어→LLM번역→검증→승인→Registry`는 코드로 닫힘. 런타임 `edim run`(승인본을 실 Table/Var/코드값으로 실행)은 **DB-backed DataProvider 부재로 미완**(현재 dry-run은 mock 한정, `apps/web/app/lib/macro/verify.ts`가 dry-run 배선을 의도적으로 연기). ⇒ STEP 6가 이 고리를 닫는다.

## 3. 확정된 설계 결정 (lmd/handoff 재가 완료 — 재론 불필요)

- **GAP1 = 코드 기반 BOM** (DATA_MODEL의 BOM/BOMLine을 `BomCodeRun` 출력 스냅샷으로 재배치).
- **모델 소싱 = B안 하이브리드** (Claude Sonnet 런치, env-swappable). `compile.ts`에 반영됨.
- **v1 함수 세트** = IF·Table·Var·PreC·Run + SUM·MIN·MAX·AVG·LOOKUP·ROUND·AND·OR.
- **주소 문법** = `EDIM_HIERARCHY_ADDRESS_CODE_MODEL.md` L296(edim:// URI + address_key) 원문 기준.
- **예약 잠금 3종** = PreC→RESERVED_FN, Cos2·FES→RESERVED_ARG (NOVA/Ian 회신 전까지 "경고"로 안전 격리).

## 4. 3층 정합 요약

- **셸(L1/L2)**: 코퍼스 로드맵(SaaS 셸-우선)·흐름지도 #5·코드 `apps/web` 3자 정합 ✅.
- **AI Macro(파트①)**: 흐름지도 #2 "Programing(Native AI + Macro)"·파트① STEP1~5·코드 `packages/macro-*` 3자 정합 ✅. STEP 6~7만 공백.
- **L3 업무(CPQ/PLM 도면/ERP)**: 흐름지도 #1·#4·BOM/CPQ에는 있으나 **코드 미구현** — 최대 공백대. `plm`·`erp` 도메인 폴더는 예약만.
- **관리자/AI학습(파트②·③)**: 흐름지도 #3·`administrator/*`에 있으나 **코드 미구현**.
