import { adminPrisma, appPrisma } from "../src/client";
import { withTenant } from "../src/tenant";
import { approve, createDraft, getApproved } from "../src/macro";
import { IDS, seedAll } from "./seed";

/**
 * STEP 5 self-verification — Macro Registry under RLS.
 *
 * Proves, on the non-superuser edim_app role, that:
 *   1. the db refuses to persist an unverified approval (compiler invariant);
 *   2. approve() supersedes the prior approved macro and bumps the revision
 *      (one active approved macro per node);
 *   3. a tenant cannot see or read another tenant's macros;
 *   4. WITH CHECK blocks writing a macro into another tenant;
 *   5. no tenant context -> 0 rows (default-deny);
 *   6. relrowsecurity = true on macro_registry.
 *
 * Requires Docker Postgres (5433) + a seeded DB. Exits non-zero on any failure.
 */

const failures: string[] = [];
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

async function main(): Promise<void> {
  await adminPrisma.macroRegistry.deleteMany({}); // clear prior runs (admin bypasses RLS)
  await seedAll();

  // tenant B: create + approve a macro (used later for cross-tenant checks) -----
  let bMacroId = "";
  await withTenant(IDS.tenantB, async (tx) => {
    bMacroId = await createDraft(tx, { stableId: IDS.b_item, dsl: "=Var(NS,1)", createdBy: IDS.ownerB });
    await approve(tx, { id: bMacroId, approvedBy: IDS.ownerB, verified: true });
  });

  await withTenant(IDS.tenantA, async (tx) => {
    const id1 = await createDraft(tx, { stableId: IDS.a_item, dsl: "=SUM(Table1(A,1:3))", createdBy: IDS.ownerA });

    // 1: unverified approval is refused ---------------------------------------
    let refused = false;
    try {
      await approve(tx, { id: id1, approvedBy: IDS.ownerA, verified: false });
    } catch {
      refused = true;
    }
    check("db refuses an unverified approval", refused);

    await approve(tx, { id: id1, approvedBy: IDS.ownerA, verified: true });
    const appr1 = await getApproved(tx, IDS.a_item);
    check(
      "approved macro is retrievable at revision 1",
      appr1?.id === id1 && appr1?.status === "approved" && appr1?.revision === 1,
      `got ${appr1?.status}/${appr1?.revision}`,
    );

    // 2: a second approval supersedes the first -------------------------------
    const id2 = await createDraft(tx, { stableId: IDS.a_item, dsl: "=SUM(Table1(A,1:3))+1", createdBy: IDS.ownerA });
    await approve(tx, { id: id2, approvedBy: IDS.ownerA, verified: true });
    const appr2 = await getApproved(tx, IDS.a_item);
    check(
      "new approval supersedes prior + bumps revision",
      appr2?.id === id2 && appr2?.revision === 2,
      `got ${appr2?.id === id2 ? "id2" : "id1"}/${appr2?.revision}`,
    );
    const superseded = (await tx.macroRegistry.findMany({ where: { stableId: IDS.a_item } })).filter(
      (m) => m.status === "superseded",
    );
    check("exactly one prior row is superseded", superseded.length === 1 && superseded[0]?.id === id1);

    // 3: cross-tenant invisibility --------------------------------------------
    const bCount = await tx.macroRegistry.count({ where: { tenantId: IDS.tenantB } });
    check("A context sees 0 tenant-B macros", bCount === 0, `bCount=${bCount}`);
    const bFound = await tx.macroRegistry.findFirst({ where: { id: bMacroId } });
    check("A context cannot read a B macro by id", bFound === null);

    // 4: WITH CHECK blocks a cross-tenant insert ------------------------------
    let blocked = false;
    try {
      await tx.macroRegistry.create({
        data: { tenantId: IDS.tenantB, stableId: IDS.b_item, dsl: "=1", createdBy: IDS.ownerA },
      });
    } catch {
      blocked = true;
    }
    check("WITH CHECK blocks cross-tenant macro insert", blocked);
  });

  // 5: no context -> default-deny ---------------------------------------------
  const bare = await appPrisma.macroRegistry.count();
  check("no tenant context -> 0 macro rows (default-deny)", bare === 0, `count=${bare}`);

  // 6: relrowsecurity flag ----------------------------------------------------
  const rows = await appPrisma.$queryRaw<{ on: boolean }[]>`
    SELECT relrowsecurity AS "on" FROM pg_class WHERE relname = 'macro_registry'`;
  check("relrowsecurity = true on macro_registry", rows[0]?.on === true);

  console.log("");
  if (failures.length > 0) {
    console.error(`MACRO REGISTRY RLS: FAIL (${failures.length} check(s))`);
    process.exit(1);
  }
  console.log("MACRO REGISTRY RLS: PASS");
}

main()
  .then(() => appPrisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await appPrisma.$disconnect();
    process.exit(1);
  });
