# STEP 4 — 도메인 폴더 ↔ 모노레포 매핑 (물리 현실 반영)

> 기존 `edim/docs/STRUCTURE.md`(PR #19)를 SSOT로 삼고, **물리적 현실**(EDIM vs edlm)과 **구현 상태**를 덧댄 실행 지도. 물리 재편은 회장님 결정 사항(D1) — 이 문서는 제안·매핑만, **실제 파일 이동 없음**.

## 1. 물리 현실 (STRUCTURE.md가 다루지 않은 것)

STRUCTURE.md §4는 도메인 스켈레톤을 개념도로만 그렸다. 실제로는 **두 폴더가 물리적으로 분리**돼 있다:

```
C:\metaverse\edlm\edim\        ← 실제 코드(pnpm apps/packages). 여기서 개발·테스트·커밋이 일어남.
C:\metaverse\EDIM\             ← 도메인 스켈레톤(빈 폴더). STRUCTURE.md §4의 물리 골격. git 밖.
```

⇒ 도메인 폴더는 **아직 코드를 담지 않는다**. "물리 재편"(D1) 시 결정해야 할 것: **edim/ 모노레포를 EDIM/ 도메인 트리로 옮길지**, 아니면 **pnpm 레이아웃 유지 + STRUCTURE.md 개념맵만 유지**할지. STRUCTURE.md의 현 입장 = 후자(레이아웃 유지, 물리 이동은 6 PR 병합 후 별건).

## 2. 통합 매핑표 (도메인 → 패키지 → 상태 → 다음)

| 도메인 폴더 | 모노레포 | 흐름지도 v3 | 상태 | 다음 작업 |
|---|---|---|---|---|
| `main_form` | `apps/web` | #5 Main form | ✅ L1/L2 셸 | Main work 패널 = L3 placeholder |
| `toolbox/UI_toolbox` | `packages/ui` | #2 UI | ✅ | — |
| `toolbox/programing_toolbox` | `packages/macro-dsl`·`macro-verify`·`macro-compile`·`macro-registry` | #2 Programing(Native AI+Macro) | ✅ STEP1~5 | **STEP 6 실행 고리**(B1) |
| `plm` | `packages/hierarchy-address`·`core-ontology` | #1 PLM(code system) | ⚠ 주소만 O | 도면/코드시스템 L3(B5) |
| `erp` | (미구현) | #4 ERP(process) | ❌ | ERP work process L3(B5) |
| `administrator/learning_AI` | (미구현, 파트②) | #3 AI 학습 | ❌ | AI 자료학습 |
| `administrator/special_programing` | (미구현, 파트③) | #3 special program | ❌ | Special Programming |
| (공통 인프라) | `packages/auth`·`db` | — | ✅ | auth 프로바이더 확정(D5) |

## 3. README 스캐폴드 — 이번 배치에서 생성하지 않은 이유

ccmd STEP 4는 "각 도메인 폴더에 README 스캐폴드 생성"을 지시했으나, `C:\metaverse\EDIM`는 **git 밖**이라 거기 생성한 README는 버전관리되지 않고, 물리 재편(D1)이 미정이라 위치가 확정 전이다. ⇒ 이번엔 **본 통합 매핑표 + 루트 `START_HERE.md`(EDIM 폴더에 미러)** 로 대체. 물리 재편 승인(D1) 후, 확정된 트리에 README를 배치하는 것이 무손실이다.

## 4. 이 문서와 STRUCTURE.md의 관계

- STRUCTURE.md(#19, 커밋됨) = **정본 개념맵**. 유지·병합 권장.
- 본 문서(05, 이 그라운딩 PR) = **물리 현실 + 상태 + 다음 작업** 오버레이. 병합 후 STRUCTURE.md에 흡수하거나 `docs/_state/` 유지 중 택일(D1과 함께 결정).
