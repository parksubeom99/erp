# EDIM — Main Form skeleton (L1 + L2)

AHU parametric CTO platform. This monorepo is the **foundation skeleton**:
multi-tenant SaaS shell + the data-address system that the Main Form sits on.
Business logic (CPQ selection, BOM expansion, drawings) is **out of scope** here.

Status: **STEP 0–6 complete (L1 + L2 skeleton)** — scaffold · L1 data model +
RLS · auth + tenant context · Hierarchy domain (recursive-CTE tree + CRUD +
audit) · Main Form 3-panel shell + design system · role-gated module menu with
server-enforced guards · E2E smoke + docs.

## Stack

TypeScript · Next.js App Router · PostgreSQL · **Prisma** ORM · pnpm workspace
(Modular Monolith). RLS is enforced in Postgres, not in application `WHERE`
clauses.

## Layout

```
apps/web            Next.js (UI + route handlers + auth glue)
packages/core-ontology   pure domain types (imports nothing)
packages/db         Prisma schema, migrations, RLS, tenant-scoped client
packages/auth       session, tenant resolution, RBAC guards
packages/ui         design system (tokens, AppShell, code chip, theme toggle)
```

Dependency direction is always downward: `core-ontology` ← `db` ← `auth`;
`ui` → `core-ontology` only; `apps/web` → everything.

## Setup (clean clone)

Requires Node ≥ 20, pnpm 9, and Docker.

```bash
cp .env.example .env          # local dev creds; APP_DATABASE_URL uses the
                              # non-superuser edim_app role so RLS applies
pnpm install
pnpm db:up                    # start Postgres (docker compose, port 5433)
pnpm db:migrate               # apply 0001_init + 0002_rls
pnpm db:generate              # generate the Prisma client
pnpm db:seed                  # 2 tenants, 3 users, sample hierarchy
```

## Run

```bash
pnpm dev                      # http://localhost:3000
```

Sign in (dev — email is the credential): `owner@acme.test`,
`viewer@acme.test`, or `owner@globex.test`. After login you land on the 3-panel
Main Form shell (Hierarchy rail · Overview · Inspector). The design system
showcase is at `/design`.

> Note: the session cookie is `Secure` in production, so a **production build
> served over plain HTTP won't stay logged in** — use `pnpm dev` locally, or
> serve the production build over HTTPS.

## Verify (per-STEP self-checks)

```bash
pnpm -w typecheck                     # STEP 0 / STEP 4
pnpm --filter @edim/web build         # STEP 0 / STEP 4
pnpm --filter @edim/db rls:test       # STEP 1 — RLS tenant isolation
pnpm --filter @edim/auth test         # STEP 2 — auth + tenant context
pnpm --filter @edim/db hierarchy:test # STEP 3 — tree CRUD + revision + audit

# STEP 5/6 E2E (needs the app running: pnpm dev, DB seeded):
BASE_URL=http://localhost:3000 pnpm smoke
```

## RLS model (non-negotiable)

- Every tenant-scoped table (`hierarchy_node`, `audit_log`, `membership`) has
  `ENABLE` + `FORCE ROW LEVEL SECURITY` with a `tenant_isolation` policy keyed
  on the `app.current_tenant` session GUC.
- Runtime queries use the **non-superuser `edim_app` role** (`APP_DATABASE_URL`)
  so RLS is actually enforced. Migrations/seed/auth-bootstrap use the owner
  connection (`DATABASE_URL`).
- `withTenant()` / `withTenantSession()` open a transaction, `set_config` the
  tenant GUC LOCAL to it, then run queries on the same connection. This is the
  only sanctioned path to tenant-scoped data.

## RBAC (STEP 5)

The module menu renders only the modules a role may use (`modulesForRole`);
unpermitted modules are **omitted**, not disabled. Every module route is _also_
guarded server-side — `GET /api/modules/<key>` returns **403** for a role that
lacks access (e.g. viewer → `finance`), so client-side hiding is never the only
defense. Role→module mapping lives in `apps/web/app/lib/modules.ts`.

## Next (out of scope here — L3)

This is the **L1 + L2 skeleton**. The next ccmd, after the RCCS code grammar
(GAP1) is fixed, binds codes onto the Hierarchy — the `hierarchy_node` table's
stable_id/revision_id split and the "code chip" component are already staged for
it. Business workflows (CPQ selection, BOM expansion, drawings, costing) fill the
Main Work Panel placeholder in L3.
