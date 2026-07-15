import type { TenantClient } from "./tenant";

/**
 * Shared audit-trail writer. Inserts an audit_log row with tenant_id sourced
 * from the current RLS GUC, so it always matches the tenant the transaction is
 * scoped to (and satisfies the RLS WITH CHECK). Every domain mutation calls this.
 */
export type AuditAction = "create" | "update" | "delete" | "move";

export async function writeAudit(
  tx: TenantClient,
  actorId: string,
  action: AuditAction,
  entity: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO audit_log (tenant_id, actor_id, action, entity, entity_id, before, after)
    VALUES (
      current_setting('app.current_tenant')::uuid,
      ${actorId}::uuid, ${action}, ${entity}, ${entityId},
      ${before === null || before === undefined ? null : JSON.stringify(before)}::jsonb,
      ${after === null || after === undefined ? null : JSON.stringify(after)}::jsonb
    )`;
}
