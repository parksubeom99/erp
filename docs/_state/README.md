# EDIM 그라운딩 · 정합 리포트 (`docs/_state/`)

> 생성: CC 자율 배치 · 2026-07-07 · 목적: **회장님 내일 검토용.** ccmd(`ccmd-edim-grounding-20260707`) 실행 산출.
> 전량 라이브 실측(`git`/`gh` + 소스 실독) 기반. 이 PR은 **문서 전용 · 머지 대기** — 회장님 검토 후 결정.

## 읽는 순서

| 문서 | 내용 | 핵심 |
|---|---|---|
| [00_STEP0_GROUND_TRUTH](00_STEP0_GROUND_TRUTH.md) | 환경 실측 대조표 | ★ **EDIM(대문자)≠edlm(소문자)** — 실작업본은 `C:\metaverse\edlm` |
| [01_INVENTORY](01_INVENTORY.md) | repo·모노레포·9패키지 인벤토리 | 3시간층 공존, L3=별개 분기, 85-MD=git 밖 |
| [02_TEST_CI_HEALTH](02_TEST_CI_HEALTH.md) | 테스트·CI 헬스 | TS 94케이스 작성됐으나 **CI 미커버**, verified-green=0 |
| [03_DESIGN_RECONCILIATION](03_DESIGN_RECONCILIATION.md) | 흐름지도 v3 ↔ 파트① ↔ 코드 | AI 트랙 STEP1~5 완성, **STEP6~7 공백** |
| [04_GAP_REGISTER](04_GAP_REGISTER.md) | 갭 목록 | [DECIDE]7 · [BUILD]5 · [VERIFY]4 · [OK]5 |
| [05_FOLDER_MONOREPO_MAP](05_FOLDER_MONOREPO_MAP.md) | 도메인↔패키지 물리 매핑 | STRUCTURE.md + 물리현실 오버레이 |
| [06_NEXT_FRONTIER_DECISIONS](06_NEXT_FRONTIER_DECISIONS.md) | 결정 패키지 | STEP6 vs L3 vs 정비, 병합 전략 |

## 회장님 최상위 검토 포인트 (내일)

1. **EDIM vs edlm** (00·D1) — 작업 기준 통일 / 물리 재편 진행 여부.
2. **병합 전략** (D2·D3) — 스택이 main과 단절 상태. skeleton PR + bottom-up + 0003 충돌 처리.
3. **다음 실구현** (06 노드A) — STEP 6(권장) / L3 CPQ / 정비 먼저.
4. **2번 사진(4516)** 설명 → 흐름지도·정합 맵 통합.

## 자율 범위 · 경계 (준수 확인)

- ✅ 한 것: 실측·클론(일회용)·문서 저작·feature 브랜치·PR 생성.
- ❌ 안 한 것(회장님 전권): PR 머지 · main push · 기존파일 수정(CI 등) · 실 파일 이동 · LLM 호출 · 스키마 변경 · 실작업본 `edlm` 변경.
