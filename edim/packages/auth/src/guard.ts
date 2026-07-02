import { withTenant, type TenantClient } from "@edim/db";
import type { Role } from "@edim/core-ontology";
import type { SessionData } from "./session";

/**
 * Run tenant-scoped work for an authenticated session. Bridges auth → db: the
 * session's tenant becomes the RLS GUC for the transaction. This is the only
 * path domain code should use to touch tenant-scoped tables.
 */
export function withTenantSession<T>(
  session: SessionData,
  fn: (tx: TenantClient) => Promise<T>,
): Promise<T> {
  return withTenant(session.tenantId, fn);
}

/** True if the session's role is one of the allowed roles. */
export function hasRole(
  session: SessionData,
  allowed: readonly Role[],
): boolean {
  return allowed.includes(session.role);
}

/** Thrown by requireRole; carries a 403 for route handlers to map onto. */
export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Assert the session may act; throws ForbiddenError (server-side gate). */
export function requireRole(
  session: SessionData,
  allowed: readonly Role[],
): void {
  if (!hasRole(session, allowed)) {
    throw new ForbiddenError(
      `role '${session.role}' not permitted (need ${allowed.join(", ")})`,
    );
  }
}
