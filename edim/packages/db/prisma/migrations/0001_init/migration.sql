-- EDIM L1 core schema (handoff §4.1–§4.3).
-- gen_random_uuid() is core in PostgreSQL 13+; pgcrypto guarantees it regardless.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- tenant ----------------------------------------------------------------------
CREATE TABLE "tenant" (
  "id"         uuid        NOT NULL DEFAULT gen_random_uuid(),
  "slug"       text        NOT NULL,
  "name"       text        NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tenant_slug_key" ON "tenant" ("slug");

-- app_user --------------------------------------------------------------------
CREATE TABLE "app_user" (
  "id"         uuid        NOT NULL DEFAULT gen_random_uuid(),
  "email"      text        NOT NULL,
  "name"       text        NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "app_user_email_key" ON "app_user" ("email");

-- membership (user <-> tenant, N:M + role) ------------------------------------
CREATE TABLE "membership" (
  "tenant_id"  uuid        NOT NULL,
  "user_id"    uuid        NOT NULL,
  "role"       text        NOT NULL,
  "created_at" timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "membership_pkey" PRIMARY KEY ("tenant_id", "user_id"),
  CONSTRAINT "membership_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "app_user" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- hierarchy_node (data address system; stable_id/revision_id split) -----------
CREATE TABLE "hierarchy_node" (
  "stable_id"     uuid        NOT NULL DEFAULT gen_random_uuid(),
  "revision_id"   uuid        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid        NOT NULL,
  "parent_stable" uuid,
  "kind"          text        NOT NULL,
  "label"         text        NOT NULL,
  "position"      integer     NOT NULL,
  "is_current"    boolean     NOT NULL DEFAULT true,
  "created_at"    timestamptz(6) NOT NULL DEFAULT now(),
  "created_by"    uuid        NOT NULL,
  CONSTRAINT "hierarchy_node_pkey" PRIMARY KEY ("stable_id", "revision_id"),
  CONSTRAINT "hierarchy_node_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "hierarchy_node_created_by_fkey" FOREIGN KEY ("created_by")
    REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "hierarchy_node_tenant_id_parent_stable_position_idx"
  ON "hierarchy_node" ("tenant_id", "parent_stable", "position");

-- audit_log -------------------------------------------------------------------
CREATE TABLE "audit_log" (
  "id"        bigserial   NOT NULL,
  "tenant_id" uuid        NOT NULL,
  "actor_id"  uuid        NOT NULL,
  "action"    text        NOT NULL,
  "entity"    text        NOT NULL,
  "entity_id" text        NOT NULL,
  "before"    jsonb,
  "after"     jsonb,
  "at"        timestamptz(6) NOT NULL DEFAULT now(),
  CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_log_tenant_id_fkey" FOREIGN KEY ("tenant_id")
    REFERENCES "tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id")
    REFERENCES "app_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
