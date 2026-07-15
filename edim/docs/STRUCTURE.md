# EDIM 구조 맵 — 도메인 ↔ 패키지 매핑

> **목적**: 회장님 업무 도메인 조직도와 기존 pnpm 모노레포(기술 패키지) 레이아웃을 1:1로 잇는 정본 지도.
> 코드는 pnpm 레이아웃(`apps/` · `packages/`)을 유지하고, 이 문서가 도메인 관점의 상위 개념맵(SSOT)을 제공한다.
> 물리 재편(패키지 폴더를 도메인 폴더로 이동)은 6 PR 병합 후 별건으로 다룬다.

## 1. 두 조직 축

| 축 | 조직 방식 | 위치 |
|----|----------|------|
| **업무 도메인** (회장님 스켈레톤) | administrator · erp · main_form · plm · toolbox | 개념/구조 (이 문서) |
| **기술 패키지** (pnpm 워크스페이스) | `apps/*` · `packages/*` | 실제 코드 |

두 축은 정합하나 조직 기준이 다르다 — 아래 매핑표가 둘을 잇는다.

## 2. 도메인 ↔ 패키지 매핑표

| 회장님 도메인 폴더 | 기존 모노레포 위치 | STEP / PR | 상태 |
|---|---|---|---|
| `toolbox/programing_toolbox` | `packages/macro-dsl` | STEP 1 · #14 | 구현 |
| `toolbox/programing_toolbox` | `packages/macro-verify` | STEP 3 · #16 | 구현 |
| `toolbox/programing_toolbox` | `packages/macro-compile` | STEP 4 · #17 | 구현 (첫 AI) |
| `toolbox/programing_toolbox` | `packages/macro-registry` | STEP 5 · #18 | 구현 |
| `toolbox/UI_toolbox` | `packages/ui` | base | 구현 |
| `main_form` | `apps/web` | base | 구현 |
| `plm` | `packages/hierarchy-address` | STEP 2 · #15 | 구현 |
| `plm` | `packages/core-ontology` | base | 구현 |
| `erp` | (미구현 — ERP work process) | — | **예정** |
| `administrator/learning_AI` | (미구현 — 파트② AI 자료학습) | — | **예정** |
| `administrator/special_programing` | (미구현 — 파트③ Special Programming) | — | **예정** |
| (공통 인프라) | `packages/auth` | base | 구현 |
| (공통 인프라) | `packages/db` | base | 구현 |

## 3. base 레이어 vs 증분 스택

- **base (`feat/edim-mainform-skeleton`)에 존재**: `apps/web` · `packages/{auth, core-ontology, db, ui}`
- **STEP별 스택 PR에서 증분 추가**:
  - `#14` → `packages/macro-dsl` (STEP 1)
  - `#15` → `packages/hierarchy-address` (STEP 2)
  - `#16` → `packages/macro-verify` (STEP 3)
  - `#17` → `packages/macro-compile` (STEP 4)
  - `#18` → `packages/macro-registry` (STEP 5)

브랜치 토폴로지:
```
main
 └─ feat/edim-mainform-skeleton   ← 모노레포 스택 뿌리
     ├─ #13 l3-project-engine
     └─ #14 macro-dsl → #15 address-resolver → #16 macro-verify → #17 macro-compile → #18 macro-registry
```

## 4. 도메인 스켈레톤 (회장님 설계 원본)

```
EDIM/
├── administrator/
│   ├── learning_AI          (예정 — 파트② AI 자료학습)
│   └── special_programing   (예정 — 파트③ Special Programming)
├── erp                      (예정 — ERP work process)
├── main_form                → apps/web
├── plm                      → packages/{hierarchy-address, core-ontology}
└── toolbox/
    ├── UI_toolbox           → packages/ui
    └── programing_toolbox   → packages/{macro-dsl, macro-verify, macro-compile, macro-registry}
```

> 빈 하위 폴더의 의도(향후 코드 배치 지점)를 위 매핑으로 보존한다. `erp` · `learning_AI` · `special_programing`은 코드 미구현 상태이며, 구현 시 위 매핑 규칙에 따라 배치한다.
