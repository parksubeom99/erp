/**
 * @edim/auth — session, tenant context, RBAC input.
 *
 * Dependency rule: auth → db, core-ontology.
 *
 * STEP 2 surface: stateless signed session, email-based resolution of
 * {userId, tenantId, role} from membership, the session→RLS bridge
 * (withTenantSession), and role guards. The Next.js cookie/redirect glue lives
 * in apps/web (framework-specific), keeping this package framework-free.
 */
export const AUTH_PACKAGE = "@edim/auth" as const;

export {
  encodeSession,
  decodeSession,
  SESSION_COOKIE,
  type SessionData,
} from "./session";
export {
  resolveUser,
  authenticate,
  membershipRole,
  type ResolvedUser,
  type TenantMembership,
} from "./resolve";
export {
  withTenantSession,
  hasRole,
  requireRole,
  ForbiddenError,
} from "./guard";
