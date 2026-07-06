import type { MacroRegistry } from "@prisma/client";
import type { TenantClient } from "./tenant";
import { requireTenant } from "./tenant";

/**
 * Macro Registry domain (Part① STEP 5, A7). Every function runs inside a
 * withTenant() transaction (tx), so RLS scopes all reads/writes to the current
 * tenant — no tenant_id WHERE clauses. Each mutation records an audit_log row.
 *
 * Layer split (db → core-ontology only, unchanged): the db enforces the
 * *compiler invariant* — it refuses to persist an approval whose candidate is
 * not `verified` — plus the state precondition (must be a draft). RBAC (which
 * role may approve/reject) is the pure @edim/macro-registry rule, enforced one
 * layer up in apps/web. One `approved` macro per node: approving supersedes the
 * prior approved row and bumps revision.
 */

async function writeAudit(
  tx: TenantClient,
  actorId: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO audit_log (tenant_id, actor_id, action, entity, entity_id, before, after)
    VALUES (
      current_setting('app.current_tenant')::uuid,
      ${actorId}::uuid, ${action}, 'macro_registry', ${entityId},
      ${before === null || before === undefined ? null : JSON.stringify(before)}::jsonb,
      ${after === null || after === undefined ? null : JSON.stringify(after)}::jsonb
    )`;
}

export interface MacroDraftInput {
  stableId: string;
  dsl: string;
  createdBy: string;
}

/** Store a compiled candidate as a draft (proposal). Approval gates verification. */
export async function createDraft(tx: TenantClient, input: MacroDraftInput): Promise<string> {
  const tenantId = await requireTenant(tx);
  const row = await tx.macroRegistry.create({
    data: {
      tenantId,
      stableId: input.stableId,
      dsl: input.dsl,
      status: "draft",
      createdBy: input.createdBy,
    },
  });
  await writeAudit(tx, input.createdBy, "macro.propose", row.id, null, {
    stableId: input.stableId,
    dsl: input.dsl,
  });
  return row.id;
}

export interface MacroApproveInput {
  id: string;
  approvedBy: string;
  /** Whether static verify left no error. The db refuses to persist if false. */
  verified: boolean;
}

/** Approve a draft: verified (compiler invariant) + draft-state, supersede prior, bump revision. */
export async function approve(tx: TenantClient, input: MacroApproveInput): Promise<void> {
  if (!input.verified) throw new Error("[@edim/db] approve refused: macro is not verified");

  const draft = await tx.macroRegistry.findFirst({ where: { id: input.id, status: "draft" } });
  if (!draft) throw new Error(`[@edim/db] no draft macro '${input.id}' to approve`);

  await tx.macroRegistry.updateMany({
    where: { stableId: draft.stableId, status: "approved" },
    data: { status: "superseded" },
  });

  const agg = await tx.macroRegistry.aggregate({ _max: { revision: true }, where: { stableId: draft.stableId } });
  const revision = (agg._max.revision ?? 0) + 1;

  await tx.macroRegistry.update({
    where: { id: input.id },
    data: {
      status: "approved",
      approvedBy: input.approvedBy,
      verifiedAtApproval: input.verified,
      approvedAt: new Date(),
      revision,
    },
  });
  await writeAudit(tx, input.approvedBy, "macro.approve", input.id, { status: "draft" }, { status: "approved", revision });
}

export interface MacroRejectInput {
  id: string;
  rejectedBy: string;
}

/** Reject a draft. RBAC is enforced by the caller (apps/web); the db checks draft-state. */
export async function reject(tx: TenantClient, input: MacroRejectInput): Promise<void> {
  const draft = await tx.macroRegistry.findFirst({ where: { id: input.id, status: "draft" } });
  if (!draft) throw new Error(`[@edim/db] no draft macro '${input.id}' to reject`);

  await tx.macroRegistry.update({ where: { id: input.id }, data: { status: "rejected" } });
  await writeAudit(tx, input.rejectedBy, "macro.reject", input.id, { status: "draft" }, { status: "rejected" });
}

/** A single macro row by id (for re-verification before approval). */
export async function getMacro(tx: TenantClient, id: string): Promise<MacroRegistry | null> {
  return tx.macroRegistry.findFirst({ where: { id } });
}

/** Every macro attached to a node, newest first. */
export async function listForNode(tx: TenantClient, stableId: string): Promise<MacroRegistry[]> {
  return tx.macroRegistry.findMany({ where: { stableId }, orderBy: { createdAt: "desc" } });
}

/** The single active approved macro for a node, or null. */
export async function getApproved(tx: TenantClient, stableId: string): Promise<MacroRegistry | null> {
  return tx.macroRegistry.findFirst({ where: { stableId, status: "approved" } });
}
