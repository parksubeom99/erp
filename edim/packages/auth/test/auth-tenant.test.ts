import {
  authenticate,
  membershipRole,
  withTenantSession,
  requireRole,
  ForbiddenError,
  encodeSession,
  decodeSession,
  type SessionData,
} from "../src/index";
import { appPrisma } from "@edim/db";

/**
 * STEP 2 self-verification (handoff §STEP 2 검증명령):
 * "다른 테넌트 유저로 A 데이터 요청 → 403/0건".
 *
 * Exercises the auth → tenant-context → RLS composition end to end against the
 * seeded data. Requires `pnpm db:seed`. Exits non-zero on any failure.
 */

const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

async function main() {
  // Sessions -----------------------------------------------------------------
  const a = await authenticate("owner@acme.test");
  const b = await authenticate("owner@globex.test");
  check(
    "owner@acme authenticates as owner of a tenant",
    a?.role === "owner",
    `${a?.role}`,
  );
  check("owner@globex authenticates as owner of a tenant", b?.role === "owner");
  check(
    "acme and globex are different tenants",
    !!a && !!b && a.tenantId !== b.tenantId,
  );
  if (!a || !b) {
    finish();
    return;
  }

  // 403 case: acme owner is NOT a member of globex --------------------------
  const crossed = await authenticate("owner@acme.test", "globex");
  check("acme owner cannot get a session for globex (403)", crossed === null);
  check(
    "membershipRole(acmeOwner, globexTenant) is null",
    (await membershipRole(a.userId, b.tenantId)) === null,
  );

  // 0-건 case: from tenant B context, tenant A rows are invisible ------------
  const bItem = await withTenantSession(b, (tx) =>
    tx.hierarchyNode.findFirst(),
  );
  check("B context sees a B row", bItem?.tenantId === b.tenantId);

  const aRowsFromB = await withTenantSession(b, (tx) =>
    tx.hierarchyNode.count({ where: { tenantId: a.tenantId } }),
  );
  check(
    "B context sees 0 tenant-A rows",
    aRowsFromB === 0,
    `count=${aRowsFromB}`,
  );

  // A known B node id is unreadable from A's context.
  if (bItem) {
    const leaked = await withTenantSession(a, (tx) =>
      tx.hierarchyNode.findFirst({ where: { stableId: bItem.stableId } }),
    );
    check("A context cannot read a B node by id", leaked === null);
  }

  // Session token integrity --------------------------------------------------
  const secret = "test-secret-key";
  const token = encodeSession(a, secret);
  const decoded = decodeSession(token, secret);
  check(
    "session round-trips",
    decoded?.userId === a.userId && decoded?.tenantId === a.tenantId,
  );
  check("tampered token rejected", decodeSession(token + "x", secret) === null);
  check("wrong secret rejected", decodeSession(token, "other") === null);

  // RBAC guard ---------------------------------------------------------------
  const viewer: SessionData = { ...a, role: "viewer" };
  let threw = false;
  try {
    requireRole(viewer, ["owner"]);
  } catch (e) {
    threw = e instanceof ForbiddenError;
  }
  check("requireRole blocks viewer from owner-only action", threw);
  finish();
}

function finish() {
  console.log("");
  if (failures.length > 0) {
    console.error(`AUTH + TENANT CONTEXT: FAIL (${failures.length})`);
    void appPrisma.$disconnect();
    process.exit(1);
  }
  console.log("AUTH + TENANT CONTEXT: PASS");
  void appPrisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await appPrisma.$disconnect();
  process.exit(1);
});
