import { createHmac, timingSafeEqual } from "node:crypto";
import { isRole, type Role } from "@edim/core-ontology";

/**
 * What every request carries once authenticated: who, which tenant, what role.
 * This is the RBAC + RLS input. `tenantId` is the *active* tenant (a user may
 * belong to several); role is that user's role in that tenant.
 */
export interface SessionData {
  userId: string;
  email: string;
  tenantId: string;
  role: Role;
}

const b64url = (buf: Buffer): string =>
  buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function sign(payload: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

/** Stateless signed token: base64url(json).base64url(hmac). */
export function encodeSession(data: SessionData, secret: string): string {
  const payload = b64url(Buffer.from(JSON.stringify(data), "utf8"));
  return `${payload}.${sign(payload, secret)}`;
}

/** Verify + parse. Returns null on any tampering, malformed, or bad shape. */
export function decodeSession(
  token: string,
  secret: string,
): SessionData | null {
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(payload, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const obj = JSON.parse(json) as Record<string, unknown>;
    if (
      typeof obj.userId === "string" &&
      typeof obj.email === "string" &&
      typeof obj.tenantId === "string" &&
      typeof obj.role === "string" &&
      isRole(obj.role)
    ) {
      return {
        userId: obj.userId,
        email: obj.email,
        tenantId: obj.tenantId,
        role: obj.role,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "edim_session";
