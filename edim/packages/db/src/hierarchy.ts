import {
  buildTree,
  type HierarchyNodeRow,
  type HierarchyTreeNode,
} from "@edim/core-ontology";
import type { TenantClient } from "./tenant";
import { requireTenant } from "./tenant";

/**
 * Hierarchy domain operations. Every function runs inside a withTenant()
 * transaction (tx), so RLS scopes all reads/writes to the current tenant — no
 * tenant_id WHERE clauses needed. Each mutation records an audit_log row.
 *
 * Revision model:
 *  - rename issues a NEW revision (toggles is_current, inserts a new revision
 *    row with the same stable_id) — demonstrating the stable/revision split.
 *  - move / soft-delete mutate the current revision in place (structural
 *    bookkeeping); the full before/after is preserved in audit_log.
 *  - soft-delete flips is_current=false, so the node (and its subtree, which can
 *    no longer be reached through it) drops out of the current tree.
 */

type AuditAction = "create" | "update" | "delete" | "move";

async function writeAudit(
  tx: TenantClient,
  actorId: string,
  action: AuditAction,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO audit_log (tenant_id, actor_id, action, entity, entity_id, before, after)
    VALUES (
      current_setting('app.current_tenant')::uuid,
      ${actorId}::uuid, ${action}, 'hierarchy_node', ${entityId},
      ${before === null || before === undefined ? null : JSON.stringify(before)}::jsonb,
      ${after === null || after === undefined ? null : JSON.stringify(after)}::jsonb
    )`;
}

/** Recursive CTE (handoff §4.5). RLS supplies the tenant filter. */
export async function getTreeRows(
  tx: TenantClient,
): Promise<HierarchyNodeRow[]> {
  return tx.$queryRaw<HierarchyNodeRow[]>`
    WITH RECURSIVE tree AS (
      SELECT stable_id AS "stableId", parent_stable AS "parentStable",
             label, kind, position, 1 AS depth
      FROM hierarchy_node
      WHERE is_current AND parent_stable IS NULL
      UNION ALL
      SELECT n.stable_id, n.parent_stable, n.label, n.kind, n.position, t.depth + 1
      FROM hierarchy_node n
      JOIN tree t ON n.parent_stable = t."stableId"
      WHERE n.is_current
    )
    SELECT * FROM tree ORDER BY depth, position`;
}

export async function getTree(tx: TenantClient): Promise<HierarchyTreeNode[]> {
  return buildTree(await getTreeRows(tx));
}

async function nextPosition(
  tx: TenantClient,
  parentStable: string | null,
): Promise<number> {
  const agg = await tx.hierarchyNode.aggregate({
    _max: { position: true },
    where: { parentStable: parentStable ?? null, isCurrent: true },
  });
  return (agg._max.position ?? -1) + 1;
}

export interface CreateNodeInput {
  parentStable: string | null;
  kind: string;
  label: string;
  createdBy: string;
  position?: number;
}

/** Create a node (appended to its siblings unless a position is given). */
export async function createNode(
  tx: TenantClient,
  input: CreateNodeInput,
): Promise<string> {
  const tenantId = await requireTenant(tx);
  const position =
    input.position ?? (await nextPosition(tx, input.parentStable));
  const row = await tx.hierarchyNode.create({
    data: {
      tenantId,
      parentStable: input.parentStable,
      kind: input.kind,
      label: input.label,
      position,
      isCurrent: true,
      createdBy: input.createdBy,
    },
  });
  await writeAudit(tx, input.createdBy, "create", row.stableId, null, {
    label: input.label,
    kind: input.kind,
    parentStable: input.parentStable,
    position,
  });
  return row.stableId;
}

/** Rename = new revision: toggle is_current, insert a fresh revision row. */
export async function renameNode(
  tx: TenantClient,
  stableId: string,
  newLabel: string,
  actorId: string,
): Promise<void> {
  const current = await tx.hierarchyNode.findFirst({
    where: { stableId, isCurrent: true },
  });
  if (!current) throw new Error(`node ${stableId} not found`);

  await tx.hierarchyNode.updateMany({
    where: { stableId, isCurrent: true },
    data: { isCurrent: false },
  });
  await tx.hierarchyNode.create({
    data: {
      stableId,
      tenantId: current.tenantId,
      parentStable: current.parentStable,
      kind: current.kind,
      label: newLabel,
      position: current.position,
      isCurrent: true,
      createdBy: actorId,
    },
  });
  await writeAudit(
    tx,
    actorId,
    "update",
    stableId,
    { label: current.label },
    { label: newLabel },
  );
}

async function reindexSiblings(
  tx: TenantClient,
  parentStable: string | null,
): Promise<void> {
  const sibs = await tx.hierarchyNode.findMany({
    where: { parentStable: parentStable ?? null, isCurrent: true },
    orderBy: { position: "asc" },
  });
  for (let i = 0; i < sibs.length; i++) {
    const s = sibs[i]!;
    if (s.position !== i) {
      await tx.hierarchyNode.updateMany({
        where: { stableId: s.stableId, isCurrent: true },
        data: { position: i },
      });
    }
  }
}

/** Move a node under a new parent at a target position; renumber siblings. */
export async function moveNode(
  tx: TenantClient,
  stableId: string,
  newParentStable: string | null,
  newPosition: number,
  actorId: string,
): Promise<void> {
  const current = await tx.hierarchyNode.findFirst({
    where: { stableId, isCurrent: true },
  });
  if (!current) throw new Error(`node ${stableId} not found`);
  const oldParent = current.parentStable;

  // Destination order without the moved node, then splice it in.
  const sibs = await tx.hierarchyNode.findMany({
    where: {
      parentStable: newParentStable ?? null,
      isCurrent: true,
      NOT: { stableId },
    },
    orderBy: { position: "asc" },
  });
  const order = sibs.map((s) => s.stableId);
  const at = Math.max(0, Math.min(newPosition, order.length));
  order.splice(at, 0, stableId);

  await tx.hierarchyNode.updateMany({
    where: { stableId, isCurrent: true },
    data: { parentStable: newParentStable ?? null },
  });
  for (let i = 0; i < order.length; i++) {
    await tx.hierarchyNode.updateMany({
      where: { stableId: order[i]!, isCurrent: true },
      data: { position: i },
    });
  }
  if ((oldParent ?? null) !== (newParentStable ?? null)) {
    await reindexSiblings(tx, oldParent);
  }

  await writeAudit(
    tx,
    actorId,
    "move",
    stableId,
    { parentStable: oldParent, position: current.position },
    { parentStable: newParentStable ?? null, position: at },
  );
}

/** Soft-delete: flip is_current=false so the node leaves the current tree. */
export async function softDeleteNode(
  tx: TenantClient,
  stableId: string,
  actorId: string,
): Promise<void> {
  const current = await tx.hierarchyNode.findFirst({
    where: { stableId, isCurrent: true },
  });
  if (!current) throw new Error(`node ${stableId} not found`);

  await tx.hierarchyNode.updateMany({
    where: { stableId, isCurrent: true },
    data: { isCurrent: false },
  });
  await reindexSiblings(tx, current.parentStable);
  await writeAudit(
    tx,
    actorId,
    "delete",
    stableId,
    { label: current.label, parentStable: current.parentStable },
    null,
  );
}
