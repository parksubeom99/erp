# STEP 1 — Ground-Truth 인벤토리 (repo · 모노레포 · 패키지)

> 근거: `origin/feat/edim-macro-registry`(스택 최상위) read-only git object 실측 + apps/web·9패키지 소스 실독. 라인 수는 실측.

## 1. 세 시간층 (한 repo에 물리 공존)

| 층 | 위치 | 정체 | 상태 |
|---|---|---|---|
| (a) 구 CAD 프로토타입 | repo 루트 (`extract_ifc.py`, `paramdb.py`, `propagate.py`, `regen_ifc.py`, `tests/test_pipeline.py`, `schema.sql`) | IFC/DXF → 파라메트릭 DB 파이프라인 | PRs #1~12 MERGED = **main** |
| (b) 신 TS 모노레포 | `edim/` 하위 | SaaS 셸(L1/L2) + AI Macro DSL 컴파일러 | feat 스택에만(미병합) |
| (c) 도메인 스켈레톤 | `C:\metaverse\EDIM\` (git 밖) | 회장님 업무 도메인 조직도의 물리 골격 | 빈 폴더 (STRUCTURE.md §4) |

두 코드층(a·b)은 빌드 툴을 공유하지 않는다(루트=Python/pip, edim/=pnpm/TS).

## 2. 모노레포 루트 (`edim/`)

- `package.json`: name `edim`, private, `packageManager pnpm@9.15.4`, `engines.node >=20`. 스크립트: `typecheck`(`pnpm -r --parallel typecheck`), `build`, `lint`, `format`, `dev`(=`--filter @edim/web dev`), `db:generate/migrate/seed`, `db:up`(docker compose), `smoke`(`node scripts/smoke.mjs`). **⚠ 집계 `test` 스크립트 없음** — 패키지별 개별 실행.
- `pnpm-workspace.yaml`: `apps/*`, `packages/*`.
- `tsconfig.base.json`: strict, ES2022, `moduleResolution Bundler`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. `@edim/*` 9개 별칭 → `packages/<x>/src/index.ts`.
- `docker-compose.yml`: 서비스 `db` 1개 = **postgres:16-alpine**, host 포트 **5433**→5432, user/pw/db 모두 `edim`, volume `edim-pgdata`.
- `.env.example`: `DATABASE_URL`(owner/마이그레이션), `APP_DATABASE_URL`(non-superuser `edim_app`, RLS 적용), `AUTH_SECRET`. **⚠ LLM(Anthropic) 키·모델 env는 미문서화**(compile 어댑터가 읽음).

## 3. Apps

**`edim/apps/web` (`@edim/web`)** — 유일 앱, 실코드. Next.js ^15.1.4(App Router) · React ^19 · dotenv. 8개 워크스페이스 패키지 전부 `workspace:*`로 소비. 역할 = Main Form 웹 셸 + API + **유일하게 db/LLM에 접촉하는 어댑터 층**.
- 페이지: `app/(app)/page.tsx`(107) · `hierarchy-tree.tsx`(115) · `module-menu.tsx`(43) · `m/[key]/page.tsx`(63) · `login/page.tsx`(64) · `design/page.tsx`(118, 디자인시스템 쇼케이스)
- API: `api/auth/{login,logout}` · `api/hierarchy` · `api/modules/[key]`(403 서버 가드)
- Macro 이음새(순수 패키지 ↔ 실데이터 어댑터): `lib/macro/address.ts`(33) · `verify.ts`(27, **dry-run 미배선**) · `compile.ts`(59, **유일 LLM 호출** — `api.anthropic.com/v1/messages`, Claude Sonnet, env 키) · `registry.ts`(77, A7 고리)

## 4. Packages (9개 — 전부 실코드, 스캐폴드 아님)

| 패키지 | 목적 | 핵심 소스(라인) | 테스트 | 상태 |
|---|---|---|---|---|
| `@edim/core-ontology` | 순수 도메인 타입(branded id, ROLES, NODE_KINDS), import 0 | `index.ts`(87) | 없음 | code(기반) |
| `@edim/macro-dsl` | DSL parser + 결정론 executor (STEP1, no LLM) | `parser.ts`(373) `tokenizer.ts`(205) `executor.ts`(213) `ast.ts`(145) `provider.ts`(69) | vitest(parser/executor + 골든 스냅샷) | code(대) |
| `@edim/hierarchy-address` | `edim://` URI ↔ 트리 resolver(STEP2), 양방향 round-trip | `resolver.ts`(111) `uri.ts`(43) `slug.ts`(22) | vitest(resolver) | code |
| `@edim/macro-verify` | A6 검증 + dry-run(STEP3), 순수 | `static.ts`(170) `verify.ts`(45) `dryrun.ts`(41) | vitest(verify/dryrun) | code |
| `@edim/macro-compile` | A4 NL→DSL 되먹임 루프(STEP4), LLM=주입 클라이언트 | `compile.ts`(71) `prompt.ts`(68) `client.ts`(50, ScriptedLLMClient) | vitest(compile/prompt) | code |
| `@edim/macro-registry` | A7 승인 규칙 + 상태기계(STEP5), 순수(영속은 db) | `index.ts`(54, 단일 파일) | vitest(approval) | code(얇으나 완결) |
| `@edim/db` | Prisma schema · 2단계 신뢰 클라이언트 · RLS 래퍼 · CRUD | `hierarchy.ts`(245) `macro.ts`(123) `tenant.ts`(57) `client.ts`(68); `schema.prisma`(Tenant/AppUser/Membership/HierarchyNode/AuditLog/MacroRegistry); migrations `0001_init`·`0002_rls`·`0003_macro_registry` | tsx 하네스(rls/hierarchy/macro) | code |
| `@edim/auth` | 무상태 서명 세션 · email→{user,tenant,role} · RLS 브리지 `withTenantSession` · 역할 가드 | `session.ts` `resolve.ts` `guard.ts` | tsx(auth-tenant) | code |
| `@edim/ui` | 디자인시스템: 토큰 + 셸(AppShell, CodeChip, ThemeToggle) | `app-shell.tsx`(218) `tokens.css`(89) | 없음 | code |

**의존 척추**: 전부 ← `core-ontology`; verify→dsl+address; compile→dsl+verify; auth→db+core; ui→core만; apps/web→전부. **순수 패키지는 db/LLM/framework를 절대 import하지 않음** — 이음새는 apps/web에만.

## 5. L3 프로젝트 엔진 = 별개 평행 분기 (중요)

`feat/edim-l3-project-engine`(#13)은 skeleton에서 macro 체인과 **평행 분기**. 실측: macro-registry 브랜치에 `project` 파일 0건, l3 브랜치에 `macro-dsl` 0건. #13은 `packages/db/project.ts`·`0003_project` 마이그레이션·`api/projects/*`·`project-detail.tsx`(스테퍼 UI)·재사용 `DataTable`을 얹음 = **CC ccmd 2호(L3 Phase A)**. AI Macro 트랙과 무관.

## 6. 85-MD 코퍼스 = git 밖 (finding)

브랜치당 `.md`는 3~4개뿐(`CATALOG.md`, `README.md`, `edim/README.md`, +#19의 `edim/docs/STRUCTURE.md`). **회장님이 주신 85-MD 설계 코퍼스는 어느 브랜치에도 커밋돼 있지 않다.** 소스 헤더들은 코퍼스를 SSOT로 인용(`uri.ts`→`EDIM_HIERARCHY_ADDRESS_CODE_MODEL.md`, `parser.ts`→"STEP 0 spec")하나 파일 자체는 repo 밖. → 코퍼스 버전관리 부재는 `04_GAP_REGISTER` [DECIDE] 항목.
