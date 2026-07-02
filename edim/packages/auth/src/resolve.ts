import { adminPrisma } from "@edim/db";
import { isRole, type Role } from "@edim/core-ontology";
import type { SessionData } from "./session";

/**
 * Auth bootstrap: "who is this user and which tenants do they belong to?"
 *
 * This runs BEFORE any tenant context exists, so it must read membership across
 * tenants — which RLS would otherwise forbid. It therefore uses adminPrisma (the
 * superuser bootstrap connection), the one sanctioned place to cross tenants.
 * Everything downstream runs tenant-scoped on appPrisma via withTenantSession().
 *
 * Skeleton auth: the email is the credential (no password yet). STEP note in the
 * handoff — a real provider slots in here without changing the shape below.
 */

export interface TenantMembership {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  role: Role;
}

export interface ResolvedUser {
  userId: string;
  email: string;
  memberships: TenantMembership[];
}

export async function resolveUser(email: string): Promise<ResolvedUser | null> {
  const user = await adminPrisma.appUser.findUnique({
    where: { email },
    include: { memberships: { include: { tenant: true } } },
  });
  if (!user) return null;

  const memberships: TenantMembership[] = user.memberships
    .filter((m) => isRole(m.role))
    .map((m) => ({
      tenantId: m.tenantId,
      tenantSlug: m.tenant.slug,
      tenantName: m.tenant.name,
      role: m.role as Role,
    }));

  return { userId: user.id, email: user.email, memberships };
}

/**
 * Authenticate and produce a session for a specific tenant. If `tenantSlug` is
 * omitted, the user's first membership is used. Returns null when the user is
 * unknown, has no memberships, or is not a member of the requested tenant —
 * the last case is the 403 the STEP 2 test exercises.
 */
export async function authenticate(
  email: string,
  tenantSlug?: string,
): Promise<SessionData | null> {
  const resolved = await resolveUser(email);
  if (!resolved || resolved.memberships.length === 0) return null;

  const chosen = tenantSlug
    ? resolved.memberships.find((m) => m.tenantSlug === tenantSlug)
    : resolved.memberships[0];
  if (!chosen) return null;

  return {
    userId: resolved.userId,
    email: resolved.email,
    tenantId: chosen.tenantId,
    role: chosen.role,
  };
}

/**
 * Re-validate on each request that the session's user really is a member of the
 * session's tenant (guards a stale/forged tenant switch). Returns the current
 * role or null if membership no longer holds.
 */
export async function membershipRole(
  userId: string,
  tenantId: string,
): Promise<Role | null> {
  const m = await adminPrisma.membership.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
  });
  if (!m || !isRole(m.role)) return null;
  return m.role;
}
