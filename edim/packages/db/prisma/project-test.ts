import { appPrisma, adminPrisma } from "../src/client";
import { withTenant } from "../src/tenant";
import { getTree } from "../src/hierarchy";
import {
  createProject,
  listProjects,
  getProject,
  setSalesStage,
  addTask,
  setTaskState,
  listTasks,
  requestApproval,
  decideApproval,
  listApprovals,
} from "../src/project";
import { seedAll, IDS } from "./seed";
import type { HierarchyTreeNode } from "@edim/core-ontology";

/**
 * STEP A0 + A1 self-verification (handoff §5):
 *  A0 — project tables are tenant-isolated (RLS) and the seeded project shows in
 *       the tree as kind='project'.
 *  A1 — createProject makes both a tree node and a detail row; stage/task/
 *       approval mutations persist and every mutation lands in audit_log.
 *
 * Reseeds first for determinism. Exits non-zero on any failure.
 */
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures.push(name);
  }
}
const flat = (ns: HierarchyTreeNode[]): HierarchyTreeNode[] =>
  ns.flatMap((n) => [n, ...flat(n.children)]);

async function main() {
  await seedAll();

  // A0: isolation ------------------------------------------------------------
  const bareCount = await appPrisma.project.count();
  check(
    "no tenant context -> 0 projects (default-deny)",
    bareCount === 0,
    `count=${bareCount}`,
  );

  await withTenant(IDS.tenantA, async (tx) => {
    const bFromA = await tx.project.count({ where: { tenantId: IDS.tenantB } });
    check(
      "A context sees 0 tenant-B projects",
      bFromA === 0,
      `count=${bFromA}`,
    );
  });

  const rls = await appPrisma.$queryRaw<{ relname: string; on: boolean }[]>`
    SELECT relname, relrowsecurity AS "on" FROM pg_class
    WHERE relname IN ('project','project_attachment','project_task','project_approval')`;
  for (const t of [
    "project",
    "project_attachment",
    "project_task",
    "project_approval",
  ]) {
    check(
      `relrowsecurity = true on ${t}`,
      rls.find((r) => r.relname === t)?.on === true,
    );
  }

  // A0: seeded project shows in the tree as kind='project'
  const tree0 = await withTenant(IDS.tenantA, (tx) => getTree(tx));
  const projNode = flat(tree0).find((n) => n.kind === "project");
  check(
    "seeded project appears in tree (kind='project')",
    projNode?.label.includes("PS-61313-5") === true,
  );

  // A1: domain CRUD + audit --------------------------------------------------
  const before = await withTenant(IDS.tenantA, (tx) => tx.auditLog.count());

  let projectId = "";
  await withTenant(IDS.tenantA, async (tx) => {
    const created = await createProject(tx, {
      parentStable: IDS.a_root,
      projectNo: "PS-99001-1",
      name: "Test Line",
      type: "internal",
      createdBy: IDS.ownerA,
    });
    projectId = created.id;
    await setSalesStage(tx, projectId, "협의", IDS.ownerA);
    const taskId = await addTask(tx, projectId, "kickoff", null, IDS.ownerA);
    await setTaskState(tx, taskId, "done", IDS.ownerA);
    const apId = await requestApproval(
      tx,
      projectId,
      IDS.ownerA,
      "please review",
    );
    await decideApproval(tx, apId, "approved", IDS.ownerA, "ok");
  });

  const list = await withTenant(IDS.tenantA, (tx) => listProjects(tx));
  check(
    "new project in listProjects",
    list.some((p) => p.projectNo === "PS-99001-1"),
  );

  const detail = await withTenant(IDS.tenantA, (tx) =>
    getProject(tx, projectId),
  );
  check(
    "stage transition persisted (협의)",
    detail?.salesStage === "협의",
    detail?.salesStage,
  );

  const tree1 = await withTenant(IDS.tenantA, (tx) => getTree(tx));
  check(
    "new project added a tree node",
    flat(tree1).some((n) => n.label.includes("PS-99001-1")),
  );

  const tasks = await withTenant(IDS.tenantA, (tx) => listTasks(tx, projectId));
  check(
    "task saved + toggled to done",
    tasks.length === 1 && tasks[0]?.state === "done",
  );

  const aps = await withTenant(IDS.tenantA, (tx) =>
    listApprovals(tx, projectId),
  );
  check(
    "approval decided (approved)",
    aps.length === 1 && aps[0]?.state === "approved",
  );

  const after = await withTenant(IDS.tenantA, (tx) => tx.auditLog.count());
  check("audit_log grew by 7", after - before === 7, `delta=${after - before}`);

  console.log("");
  if (failures.length > 0) {
    console.error(`PROJECT DOMAIN: FAIL (${failures.length})`);
    process.exit(1);
  }
  console.log("PROJECT DOMAIN: PASS");
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
