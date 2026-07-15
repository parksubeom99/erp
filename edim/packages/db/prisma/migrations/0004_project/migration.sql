-- L3 Phase A: Project Management (handoff §3.1).
-- Every table is tenant-scoped and gets ENABLE + FORCE RLS with the same
-- app.current_tenant policy as 0002_rls. Kept in lockstep with schema.prisma.

-- project ---------------------------------------------------------------------
CREATE TABLE "project" (
  "id"               uuid        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        uuid        NOT NULL,
  "hierarchy_stable" uuid        NOT NULL,
  "project_no"       text        NOT NULL,
  "name"             text        NOT NULL,
  "type"             text        NOT NULL,
  "client_name"      text,
  "client_contact"   text,
  "item_type"        text,
  "sales_stage"      text        NOT NULL,
  "status"           text        NOT NULL,
  "created_at"       timestamptz(6) NOT NULL DEFAULT now(),
  "created_by"       uuid        NOT NULL,
  CONSTRAINT "project_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "project_tenant_id_project_no_key"
  ON "project" ("tenant_id", "project_no");
CREATE INDEX "project_tenant_id_hierarchy_stable_idx"
  ON "project" ("tenant_id", "hierarchy_stable");

-- project_attachment ----------------------------------------------------------
CREATE TABLE "project_attachment" (
  "id"          uuid        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   uuid        NOT NULL,
  "project_id"  uuid        NOT NULL,
  "department"  text        NOT NULL,
  "doc_type"    text        NOT NULL,
  "name"        text        NOT NULL,
  "description" text,
  "file_ref"    text        NOT NULL,
  "uploaded_at" timestamptz(6) NOT NULL DEFAULT now(),
  "uploaded_by" uuid        NOT NULL,
  CONSTRAINT "project_attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_attachment_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_attachment_project_id_fkey" FOREIGN KEY ("project_id")
    REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_attachment_uploaded_by_fkey" FOREIGN KEY ("uploaded_by")
    REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "project_attachment_tenant_id_project_id_idx"
  ON "project_attachment" ("tenant_id", "project_id");

-- project_task ----------------------------------------------------------------
CREATE TABLE "project_task" (
  "id"         uuid        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid        NOT NULL,
  "project_id" uuid        NOT NULL,
  "title"      text        NOT NULL,
  "state"      text        NOT NULL,
  "due_at"     timestamptz(6),
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "project_task_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_task_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_task_project_id_fkey" FOREIGN KEY ("project_id")
    REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "project_task_tenant_id_project_id_idx"
  ON "project_task" ("tenant_id", "project_id");

-- project_approval ------------------------------------------------------------
CREATE TABLE "project_approval" (
  "id"           uuid        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"    uuid        NOT NULL,
  "project_id"   uuid        NOT NULL,
  "requester_id" uuid        NOT NULL,
  "approver_id"  uuid,
  "state"        text        NOT NULL,
  "note"         text,
  "requested_at" timestamptz(6) NOT NULL DEFAULT now(),
  "decided_at"   timestamptz(6),
  CONSTRAINT "project_approval_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_approval_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_approval_project_id_fkey" FOREIGN KEY ("project_id")
    REFERENCES "project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "project_approval_requester_id_fkey" FOREIGN KEY ("requester_id")
    REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "project_approval_approver_id_fkey" FOREIGN KEY ("approver_id")
    REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "project_approval_tenant_id_project_id_idx"
  ON "project_approval" ("tenant_id", "project_id");

-- RLS: enable + force + tenant-isolation policy on all four tables ------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['project','project_attachment','project_task','project_approval']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid) WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant'', true), '''')::uuid)',
      t);
    -- Explicit grants (default privileges from 0002_rls already cover this,
    -- but be explicit for clarity/safety).
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO edim_app', t);
  END LOOP;
END
$$;
