# STEP 0 — Ground-Truth 대조표 (환경·목표 실측)

> 실행: CC (자율 배치) · 일자: 2026-07-07 · 근거: 로컬 파일시스템 + `gh`/`git` 라이브 실측
> 진리 우선순위: **실측 > nmd 기재 > 기억.** 아래 표의 "실측" 칸은 전부 이번 세션 명령 출력.

## 0. 한 줄 결론

nmd/lmd의 GitHub 주장은 **전부 사실로 확인**됐다. 유일한 핵심 drift는 **"로컬 작업 위치"** — 회장님이 가리킨 `C:\metaverse\EDIM`(대문자)은 **빈 도메인 스켈레톤**이고, **실제 git 작업본은 `C:\metaverse\edlm`(소문자)**이다. 대소문자만 다른 쌍둥이 폴더가 혼동의 원인이었다.

## 1. 대조표

| 항목 | nmd/lmd 기재 | 실측 결과 | 일치? |
|---|---|---|---|
| 원격 repo | `parksubeom99/edim` (erp→edim 리네임 완료) | `gh repo view parksubeom99/edim` = 존재. owner=parksubeom99, 나 인증됨 | ✅ |
| **로컬 활성 repo** | (가정: EDIM 폴더) | `C:\metaverse\edlm` = git repo (working tree clean). `C:\metaverse\EDIM`·`C:\dev\metaverse\EDIM` = **.git 없음** | ⚠️ **위치 정정** |
| 로컬 remote URL | edim | `C:\metaverse\edlm` remote = `github.com/parksubeom99/**erp**.git` (미갱신, GitHub 리다이렉트로 작동) | ⚠️ stale |
| 체크아웃 위치 | STEP 5 HEAD | `feat/edim-macro-registry` @ `ef34c37` (= lmd가 지정한 STEP 6 base) | ✅ |
| OPEN PR | #13~#18 + #19 | `gh pr list` = #13~#19 전부 OPEN | ✅ |
| MERGED PR | #1~#12 | #1~#12 MERGED (구 CAD 파이프라인) | ✅ |
| 모노레포 apps/packages | edim/ 하위 존재 | `edlm/edim/{apps,packages}` 실재 (apps/web + 9 packages, node_modules 설치됨) | ✅ |
| 도메인 스켈레톤 | 오늘 재편 중 | `C:\metaverse\EDIM\{administrator,erp,main_form,plm,toolbox}` = 빈 하위폴더 (STRUCTURE.md §4의 물리 구현) | ✅ |

## 2. 세 개의 물리적 위치 (혼동 방지 정본)

```
C:\metaverse\edlm\           ← ★ 실제 git 작업본 (이걸로 작업한다)
  ├─ (repo root)             구 Python CAD 프로토타입 (PRs #1~12, main)
  └─ edim\                   신 TS 모노레포 (apps/web + packages/*, SaaS+AI Macro)

C:\metaverse\EDIM\           ← 회장님 도메인 스켈레톤 (빈 폴더, git 밖, STRUCTURE.md §4)
  ├─ administrator\{learning_AI, special_programing}
  ├─ erp\  main_form\  plm\
  └─ toolbox\{UI_toolbox, programing_toolbox}

C:\metaverse\edim-repo\      ← CC가 이번 세션에 뜬 일회용 클론 (그라운딩 작업용, 삭제 가능)
```

> 원격은 하나(`parksubeom99/edim`). `edlm`(remote=erp URL)과 `edim-repo`(remote=edim URL)는 같은 GitHub repo를 가리킨다.

## 3. git 위상 (실측)

- `origin/main` = `121affe` (PR #12 머지) = **구 Python 프로토타입.** edim/ 모노레포는 main에 **없다.**
- `feat/edim-mainform-skeleton` = `618e9f6` (L1+L2 골격) = main보다 **딱 1커밋 앞** — **main에 여는 PR이 없어 미병합.** ⇒ **스택 전체가 아직 main과 단절.**
- 스택(base ← head): skeleton ← {#13 l3, #19 docs}; skeleton ← #14 macro-dsl ← #15 address ← #16 verify ← #17 compile ← #18 registry.
- 로컬 `edlm`에는 과거 CC 세션 잔재 `claude/*` 브랜치 4개 존재(원격에 없음).

## 4. 체크포인트 판정

- **PASS (조정).** 활성 repo 위치 확정(`edlm`), 워크스페이스 실재 확인, PR 스택 실측 완료. ccmd의 "로컬=repo(EDIM)" 전제만 **위치 정정**하고 진행했다(유사경로 임의 실행 아님 — 실제 repo를 클론해 그 위에서 작업).
- 후속 STEP는 **일회용 클론 `edim-repo`** 에서 수행하며, 회장님 실작업본 `edlm`은 **건드리지 않는다**(워킹트리 clean 유지).

## 5. 회장님 확인 필요 (내일)

1. **EDIM(대문자) vs edlm(소문자)** — 앞으로 작업 기준을 `edlm`으로 통일할지, 아니면 `EDIM` 도메인 폴더로 **물리 재편**을 실제 진행할지 (STRUCTURE.md는 "6 PR 병합 후 별건"으로 연기 중).
2. **로컬 remote URL** `erp`→`edim` 갱신 여부 (`git remote set-url`).
3. `claude/*` 잔재 브랜치 4개 정리 여부.
