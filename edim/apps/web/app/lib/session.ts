import { cookies } from "next/headers";
import {
  decodeSession,
  membershipRole,
  SESSION_COOKIE,
  type SessionData,
} from "@edim/auth";

/**
 * Resolve the current request's session (server-side). Beyond verifying the
 * signed cookie, it re-checks that the user is *still* a member of the session's
 * tenant with the claimed role — so a revoked membership or a tampered tenant
 * can't ride an old cookie. Returns null when unauthenticated/invalid.
 */
export async function getServerSession(): Promise<SessionData | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = decodeSession(raw, secret);
  if (!session) return null;

  const role = await membershipRole(session.userId, session.tenantId);
  if (!role) return null;

  return { ...session, role };
}
