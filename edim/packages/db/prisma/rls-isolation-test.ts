import { appPrisma } from "../src/client";
import { withTenant, currentTenantOf } from "../src/tenant";
import { IDS, seedAll } from "./seed";

/**
 * STEP 1 self-verification (handoff §STEP 1 검증명령).
 *
 * Proves Postgres RLS — not an app WHERE clause — isolates tenants:
 *   1. tenant A context sees only A's rows (B count == 0 from A).
 *   2. reading a known B row from A's context returns null.
 *   3. no tenant context at all -> 0 rows (default-deny).
 *   4. WITH CHECK blocks writing a row into another tenant.
 *   5. relrowsecurity = true on the three tenant-scoped tables.
 *
 * Runs on appPrisma (the non-superuser edim_app role) so RLS is enforced.
 * Requires `pnpm db:seed` first. Exits non-zero on any failure.
 */

const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

async function main() {
  await seedAll(); // reset to a known state so the row-count checks are stable

  // 1 + 2: tenant A context ---------------------------------------------------
  await withTenant(IDS.tenantA, async (tx) => {
    const guc = await currentTenantOf(tx);
    check(
      "GUC set to tenant A inside withTenant",
      guc === IDS.tenantA,
      `got ${guc}`,
    );

    const all = await tx.hierarchyNode.findMany();
    const foreign = all.filter((n) => n.tenantId !== IDS.tenantA);
    check(
      "A context returns only A rows",
      all.length === 3 && foreign.length === 0,
      `count=${all.length}, foreign=${foreign.length}`,
    );

    const bCount = await tx.hierarchyNode.count({
      where: { tenantId: IDS.tenantB },
    });
    check("A context sees 0 tenant-B rows", bCount === 0, `bCount=${bCount}`);

    const bItem = await tx.hierarchyNode.findFirst({
      where: { stableId: IDS.b_item },
    });
    check("A context cannot read a known B row by id", bItem === null);

    // 4: WITH CHECK — inserting a B-scoped row from A context must be rejected.
    let blocked = false;
    try {
      await tx.hierarchyNode.create({
        data: {
          tenantId: IDS.tenantB,
          parentStable: null,
          kind: "item",
          label: "smuggled",
          position: 99,
          createdBy: IDS.ownerB,
        },
      });
    } catch {
      blocked = true;
    }
    check("WITH CHECK blocks cross-tenant insert from A context", blocked);
  });

  // 3: no context -> default-deny --------------------------------------------
  const bare = await appPrisma.hierarchyNode.count();
  check(
    "no tenant context -> 0 rows (default-deny)",
    bare === 0,
    `count=${bare}`,
  );

  // 5: relrowsecurity flag ----------------------------------------------------
  const rows = await appPrisma.$queryRaw<{ relname: string; on: boolean }[]>`
    SELECT relname, relrowsecurity AS "on"
    FROM pg_class
    WHERE relname IN ('hierarchy_node', 'audit_log', 'membership')
    ORDER BY relname`;
  for (const t of ["audit_log", "hierarchy_node", "membership"]) {
    const r = rows.find((x) => x.relname === t);
    check(`relrowsecurity = true on ${t}`, r?.on === true);
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`RLS ISOLATION: FAIL (${failures.length} check(s))`);
    process.exit(1);
  }
  console.log("RLS ISOLATION: PASS");
}

main()
  .then(() => appPrisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await appPrisma.$disconnect();
    process.exit(1);
  });
