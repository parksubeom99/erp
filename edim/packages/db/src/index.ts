/**
 * @edim/db — schema, Prisma client, and RLS plumbing.
 *
 * Dependency rule: db → core-ontology only.
 *
 * STEP 1 surface: the two-trust-level clients and the tenant-scoped transaction
 * wrapper that makes Postgres RLS the real defense line. Hierarchy CRUD + the
 * recursive-CTE tree query arrive in STEP 3.
 */
export const DB_PACKAGE = "@edim/db" as const;

export { adminPrisma, appPrisma, Prisma } from "./client";
export type { PrismaClient } from "./client";
export { withTenant, currentTenantOf, requireTenant } from "./tenant";
export type { TenantClient } from "./tenant";
export {
  getTree,
  getTreeRows,
  createNode,
  renameNode,
  moveNode,
  softDeleteNode,
} from "./hierarchy";
export type { CreateNodeInput } from "./hierarchy";
