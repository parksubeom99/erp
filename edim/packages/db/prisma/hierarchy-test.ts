import { adminPrisma, appPrisma } from "../src/client";
import { withTenant } from "../src/tenant";
import {
  getTree,
  createNode,
  renameNode,
  moveNode,
  softDeleteNode,
} from "../src/hierarchy";
import { seedAll, IDS } from "./seed";
import type { HierarchyTreeNode } from "@edim/core-ontology";

/**
 * STEP 3 self-verification (handoff §STEP 3 검증명령):
 *  - recursive CTE returns a depth/position-ordered tree,
 *  - create/rename/move/soft-delete behave correctly,
 *  - rename issues a new revision (is_current toggled),
 *  - every mutation lands in audit_log.
 *
 * Resets to the known seed first, so it's repeatable. Exits non-zero on failure.
 */

const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}

function flatten(nodes: HierarchyTreeNode[]): HierarchyTreeNode[] {
  return nodes.flatMap((n) => [n, ...flatten(n.children)]);
}
function find(nodes: HierarchyTreeNode[], label: string) {
  return flatten(nodes).find((n) => n.label === label);
}

async function main() {
  await seedAll();

  const before = await withTenant(IDS.tenantA, (tx) => tx.auditLog.count());

  // Baseline tree from the recursive CTE ------------------------------------
  const t0 = await withTenant(IDS.tenantA, (tx) => getTree(tx));
  check("one root", t0.length === 1, `roots=${t0.length}`);
  const root0 = t0[0];
  check(
    "root is the set-up node at depth 1",
    root0?.label === "EDIM Set-up" && root0?.depth === 1,
  );
  const mod0 = root0?.children[0];
  check("module at depth 2", mod0?.label === "AHU-01" && mod0?.depth === 2);
  check(
    "item at depth 3",
    mod0?.children[0]?.label === "Cooling Coil" &&
      mod0?.children[0]?.depth === 3,
  );

  // Mutations: create + rename(→revision) + move --------------------------
  let newMod = "";
  await withTenant(IDS.tenantA, async (tx) => {
    newMod = await createNode(tx, {
      parentStable: IDS.a_root,
      kind: "module",
      label: "AHU-02",
      createdBy: IDS.ownerA,
    });
    await renameNode(tx, IDS.a_item, "Cooling Coil v2", IDS.ownerA);
    await moveNode(tx, newMod, IDS.a_mod, 0, IDS.ownerA);
  });

  const t1 = await withTenant(IDS.tenantA, (tx) => getTree(tx));
  const root1 = t1[0];
  check(
    "root has 1 child after AHU-02 moved away",
    root1?.children.length === 1,
    `children=${root1?.children.length}`,
  );
  const mod1 = find(t1, "AHU-01");
  check(
    "AHU-01 now has 2 children (AHU-02, item)",
    mod1?.children.length === 2,
    `children=${mod1?.children.length}`,
  );
  check(
    "AHU-02 is first child (position 0)",
    mod1?.children[0]?.label === "AHU-02",
  );
  check(
    "rename is visible in the tree",
    !!find(t1, "Cooling Coil v2") && !find(t1, "Cooling Coil"),
  );
  check("moved node reports depth 3", find(t1, "AHU-02")?.depth === 3);

  // Revision check: item now has 2 revisions, exactly 1 current ------------
  const revs = await adminPrisma.hierarchyNode.findMany({
    where: { stableId: IDS.a_item },
  });
  check(
    "item has 2 revisions after rename",
    revs.length === 2,
    `revs=${revs.length}`,
  );
  check(
    "exactly one current revision",
    revs.filter((r) => r.isCurrent).length === 1,
  );

  // Soft-delete -------------------------------------------------------------
  await withTenant(IDS.tenantA, (tx) =>
    softDeleteNode(tx, IDS.a_item, IDS.ownerA),
  );
  const t2 = await withTenant(IDS.tenantA, (tx) => getTree(tx));
  check("soft-deleted item leaves the tree", !find(t2, "Cooling Coil v2"));
  check(
    "AHU-01 has 1 child after delete",
    find(t2, "AHU-01")?.children.length === 1,
  );

  // Audit: 4 mutations recorded --------------------------------------------
  const after = await withTenant(IDS.tenantA, (tx) => tx.auditLog.count());
  check(
    "audit_log grew by 4 (create/update/move/delete)",
    after - before === 4,
    `delta=${after - before}`,
  );

  console.log("");
  if (failures.length > 0) {
    console.error(`HIERARCHY DOMAIN: FAIL (${failures.length})`);
    process.exit(1);
  }
  console.log("HIERARCHY DOMAIN: PASS");
}

main()
  .then(async () => {
    await appPrisma.$disconnect();
    await adminPrisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await appPrisma.$disconnect();
    await adminPrisma.$disconnect();
    process.exit(1);
  });
