-- STEP 5: approved-macro Registry (A7). Per-tenant, RLS FORCE — mirrors 0002_rls.
-- Kept in lockstep with schema.prisma (model MacroRegistry) by hand.
--
-- stable_id is a SOFT reference to hierarchy_node identity: that table's PK is
-- composite (stable_id + revision_id), so a plain FK is not expressible. RLS
-- guarantees same-tenant. This mirrors hierarchy_node.parent_stable.

CREATE TABLE "macro_registry" (
  "id"                   uuid           NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"            uuid           NOT NULL,
  "stable_id"            uuid           NOT NULL,
  "dsl"                  text           NOT NULL,
  "status"               text           NOT NULL DEFAULT 'draft',
  "revision"             integer        NOT NULL DEFAULT 1,
  "verified_at_approval" boolean        NOT NULL DEFAULT false,
  "created_by"           uuid           NOT NULL,
  "approved_by"          uuid,
  "created_at"           timestamptz(6) NOT NULL DEFAULT now(),
  "approved_at"          timestamptz(6),
  CONSTRAINT "macro_registry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "macro_registry"
  ADD CONSTRAINT "macro_registry_tenant_fk"
  FOREIGN KEY ("tenant_id") REFERENCES "tenant"("id") ON DELETE CASCADE;
ALTER TABLE "macro_registry"
  ADD CONSTRAINT "macro_registry_creator_fk"
  FOREIGN KEY ("created_by") REFERENCES "app_user"("id");
ALTER TABLE "macro_registry"
  ADD CONSTRAINT "macro_registry_approver_fk"
  FOREIGN KEY ("approved_by") REFERENCES "app_user"("id");

CREATE INDEX "macro_registry_tenant_node_status_idx"
  ON "macro_registry" ("tenant_id", "stable_id", "status");

-- edim_app also gets this via ALTER DEFAULT PRIVILEGES (0002); granted here
-- explicitly so the table is usable regardless of who runs the migration.
GRANT SELECT, INSERT, UPDATE, DELETE ON "macro_registry" TO edim_app;

-- RLS: enable + FORCE (applies even to the table owner) + tenant-isolation.
ALTER TABLE "macro_registry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "macro_registry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "macro_registry"
  USING      ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  WITH CHECK ("tenant_id" = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
