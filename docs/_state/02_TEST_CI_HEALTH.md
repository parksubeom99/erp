# STEP 2 — 테스트 · CI 헬스

> 근거: main 워킹트리에서 Python 실행 시도 + `origin/feat/edim-macro-registry` 테스트 파일 실독. **수치는 실행/실독 결과만.**

## 1. 정직한 헬스 판정 (한 줄)

**현재 verified-green = 0.** 테스트 *저작*은 두 스택 모두 건강(진짜 불변식·상태기계·격리 검증)하나, *검증된* 상태는 0 — Python은 네이티브 의존성 부재로 collection 실패, TS는 CI에 아예 배선 안 됨(수동 미실행).

## 2. 테스트 인벤토리

| 영역 | 파일 | 케이스(실독) | 러너 | 실행? | 실제 결과 |
|---|---|---|---|---|---|
| Python 루트 `tests/` (main) | `test_pipeline.py` (+conftest shim) | 6 함수 | pytest 9.1.1 | **시도→실패** | `ModuleNotFoundError: No module named 'ezdxf'` (collection 중단, **0개 실행**). ifcopenshell·matplotlib도 부재 |
| `@edim/macro-dsl` | parser/executor.test.ts (+snap) | 35 (`it`) | vitest 3.0.5 | 미실행 | golden AST + 함수형별 + 실패위치 |
| `@edim/hierarchy-address` | resolver.test.ts | 18 | vitest | 미실행 | round-trip 포함 |
| `@edim/macro-verify` | verify(11)/dryrun(8) | 19 | vitest | 미실행 | — |
| `@edim/macro-compile` | compile(9)/prompt(4) | 13 | vitest | 미실행 | — |
| `@edim/macro-registry` | approval.test.ts | 9 | vitest | 미실행 | RBAC + 상태기계 |
| `@edim/db` | prisma/{rls,hierarchy,macro}-test.ts | 하네스 | tsx | 미실행 | **라이브 Postgres 필요** |
| `@edim/auth` | auth-tenant.test.ts | ~9 assert | tsx | 미실행 | 라이브 DB 필요 |
| E2E | `scripts/smoke.mjs` | login→tree→module | node | 미실행 | 서버 기동 필요 |

**TS 테스트 파일 9개 / vitest 소스 케이스 ~94.** (`core-ontology`·`ui`는 테스트 없음.)

> **lmd 수치와의 대조**: lmd §4는 macro-dsl 48·macro-registry 15로 기재. 실독은 35·9. 차이는 **소스의 `it` 개수(실독) vs 런타임 `test.each` 전개 개수**로 설명 가능(불일치가 아니라 계수 기준 차이). macro-verify 19·macro-compile 13·hierarchy-address 18은 정확히 일치. → `04_GAP` [VERIFY]로 기록(실행해 확정 권장).

## 3. CI

- 워크플로 **단 1개**: `.github/workflows/ci.yml`, main과 macro-registry 브랜치에서 **바이트 동일**.
- 내용: `setup-python` → `pip install -r requirements.txt pytest` → `python -m pytest -q`. **Python 루트만.**
- 트리거: `push`/`pull_request` on `[main]` 만. feature 브랜치 push는 CI 미발동.
- **Node/pnpm/vitest 스텝 전무.** ⇒ **TS 모노레포(94 케이스 + auth/RLS + smoke)는 CI 완전 미커버.**
- PR #13~#19 전부 `statusCheckRollup: []` — GitHub 체크 0건(검증 주장은 PR 본문에만, 자동 강제 없음).

## 4. 갭 요약

1. **TS CI 부재** — 가장 큰 코드베이스가 자동 검증 밖. → `04_GAP` [BUILD] (ci.yml에 pnpm typecheck+vitest 매트릭스 추가).
2. **DB 게이트 보류** — `db:rls:test`·`auth:test`·smoke는 Docker Postgres(5433) 기동 시에만. lmd도 "코드 결함 아님, 환경 사유"로 기재. 기동 후 일괄 실행 권장.
3. **Python CI 취약** — `ifcopenshell>=0.7`(무거운 네이티브)에 의존, 베어 환경에서 깨질 수 있음.

## 5. 자율 범위 내 조치 (이 PR에서 하지 않은 것)

CI 초안(ci.yml TS 스텝)은 **기존 파일 수정**이 되고 회장님 병합 스택과 얽히므로 이번 자율 배치에서 **생성하지 않음** — `04_GAP`의 [BUILD] 제안으로만 남김(회장님 승인 후 별건). 새 파일 무충돌 원칙(ccmd STEP 2) 준수.
