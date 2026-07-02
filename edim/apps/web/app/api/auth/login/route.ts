import { NextResponse, type NextRequest } from "next/server";
import { authenticate, encodeSession, SESSION_COOKIE } from "@edim/auth";

/**
 * Dev login. POST { email, tenantSlug? }. The email is the credential in this
 * skeleton (no password yet — a real provider slots in behind authenticate()).
 * On success, sets the signed, httpOnly session cookie.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not set" }, { status: 500 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: unknown;
    tenantSlug?: unknown;
  };
  const email = typeof body.email === "string" ? body.email : "";
  const tenantSlug =
    typeof body.tenantSlug === "string" ? body.tenantSlug : undefined;

  const session = await authenticate(email, tenantSlug);
  if (!session) {
    return NextResponse.json(
      { error: "unknown user or not a member of that tenant" },
      { status: 401 },
    );
  }

  const res = NextResponse.json({
    ok: true,
    tenantId: session.tenantId,
    role: session.role,
  });
  res.cookies.set(SESSION_COOKIE, encodeSession(session, secret), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
