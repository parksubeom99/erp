-- Row-Level Security (handoff §4.4 — non-negotiable). The DB is the final line
-- of defense; the app never substitutes a WHERE clause for RLS.
--
-- Isolation works via a session GUC `app.current_tenant`, set per transaction by
-- the app (see src/tenant.ts). Policies compare tenant_id to that GUC. When the
-- GUC is unset the comparison is NULL -> row is hidden (default-deny).

-- 1) Non-superuser, non-BYPASSRLS application role -----------------------------
-- The migration/owner role (DATABASE_URL) bypasses RLS; the runtime app MUST
-- connect as this restricted role for RLS to actually apply. Password matches
-- APP_DATABASE_URL in .env.example (local dev only — change for real deploys).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edim_app') THEN
    CREATE ROLE edim_app LOGIN PASSWORD 'edim_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO edim_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO edim_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO edim_app;

-- Future tables/sequences created by the owner get the same grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO edim_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO edim_app;

-- 2) Enable + FORCE RLS on tenant-scoped tables -------------------------------
-- FORCE makes the policy apply even to the table owner, so a misconfigured
-- owner connection can't silently leak across tenants.
ALTER TABLE "hierarchy_node" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "hierarchy_node" FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_log"      FORCE ROW LEVEL SECURITY;
ALTER TABLE "membership"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "membership"     FORCE ROW LEVEL SECURITY;

-- 3) Tenant-isolation policies ------------------------------------------------
-- NULLIF(...,'') guards against an empty-string GUC failing the uuid cast.
CREATE POLICY "tenant_isolation" ON "hierarchy_node"
  USING      ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY "tenant_isolation" ON "audit_log"
  USING      ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

CREATE POLICY "tenant_isolation" ON "membership"
  USING      ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
