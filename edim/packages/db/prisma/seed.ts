import { adminPrisma } from "../src/client";

/**
 * Dev seed. Runs on the admin (RLS-bypassing) connection so it can populate
 * multiple tenants in one pass. Idempotent: fixed UUIDs + upserts, and the
 * hierarchy is rebuilt each run.
 *
 * Two tenants exist specifically so STEP 1's isolation test can prove tenant A
 * cannot see tenant B. Role-varied users (owner/viewer) feed STEP 5's RBAC.
 *
 * `seedAll` and `IDS` are exported so tests can reset to a known state; the
 * script only self-executes when run directly (so importing IDS has no
 * side effects).
 */

// Deterministic ids so tests can reference known rows across runs.
export const IDS = {
  tenantA: "00000000-0000-4000-8000-00000000000a",
  tenantB: "00000000-0000-4000-8000-00000000000b",
  ownerA: "10000000-0000-4000-8000-00000000000a",
  viewerA: "20000000-0000-4000-8000-00000000000a",
  ownerB: "10000000-0000-4000-8000-00000000000b",
  // hierarchy (tenant A)
  a_root: "a0000000-0000-4000-8000-000000000001",
  a_mod: "a0000000-0000-4000-8000-000000000002",
  a_item: "a0000000-0000-4000-8000-000000000003",
  // hierarchy (tenant B)
  b_root: "b0000000-0000-4000-8000-000000000001",
  b_mod: "b0000000-0000-4000-8000-000000000002",
  b_item: "b0000000-0000-4000-8000-000000000003",
} as const;

export async function seedAll(): Promise<void> {
  // Tenants -------------------------------------------------------------------
  await adminPrisma.tenant.upsert({
    where: { id: IDS.tenantA },
    create: { id: IDS.tenantA, slug: "acme", name: "Acme AHU" },
    update: { slug: "acme", name: "Acme AHU" },
  });
  await adminPrisma.tenant.upsert({
    where: { id: IDS.tenantB },
    create: { id: IDS.tenantB, slug: "globex", name: "Globex Air" },
    update: { slug: "globex", name: "Globex Air" },
  });

  // Users ---------------------------------------------------------------------
  await adminPrisma.appUser.upsert({
    where: { id: IDS.ownerA },
    create: { id: IDS.ownerA, email: "owner@acme.test", name: "Acme Owner" },
    update: { email: "owner@acme.test", name: "Acme Owner" },
  });
  await adminPrisma.appUser.upsert({
    where: { id: IDS.viewerA },
    create: { id: IDS.viewerA, email: "viewer@acme.test", name: "Acme Viewer" },
    update: { email: "viewer@acme.test", name: "Acme Viewer" },
  });
  await adminPrisma.appUser.upsert({
    where: { id: IDS.ownerB },
    create: {
      id: IDS.ownerB,
      email: "owner@globex.test",
      name: "Globex Owner",
    },
    update: { email: "owner@globex.test", name: "Globex Owner" },
  });

  // Memberships (composite PK) ------------------------------------------------
  const memberships = [
    { tenantId: IDS.tenantA, userId: IDS.ownerA, role: "owner" },
    { tenantId: IDS.tenantA, userId: IDS.viewerA, role: "viewer" },
    { tenantId: IDS.tenantB, userId: IDS.ownerB, role: "owner" },
  ];
  for (const m of memberships) {
    await adminPrisma.membership.upsert({
      where: { tenantId_userId: { tenantId: m.tenantId, userId: m.userId } },
      create: m,
      update: { role: m.role },
    });
  }

  // Hierarchy (rebuilt each run) ----------------------------------------------
  await adminPrisma.hierarchyNode.deleteMany({
    where: { tenantId: { in: [IDS.tenantA, IDS.tenantB] } },
  });

  const nodes = [
    // tenant A: 3-level tree
    {
      stableId: IDS.a_root,
      tenantId: IDS.tenantA,
      parentStable: null,
      kind: "set-up",
      label: "EDIM Set-up",
      position: 0,
      createdBy: IDS.ownerA,
    },
    {
      stableId: IDS.a_mod,
      tenantId: IDS.tenantA,
      parentStable: IDS.a_root,
      kind: "module",
      label: "AHU-01",
      position: 0,
      createdBy: IDS.ownerA,
    },
    {
      stableId: IDS.a_item,
      tenantId: IDS.tenantA,
      parentStable: IDS.a_mod,
      kind: "item",
      label: "Cooling Coil",
      position: 0,
      createdBy: IDS.ownerA,
    },
    // tenant B: 3-level tree
    {
      stableId: IDS.b_root,
      tenantId: IDS.tenantB,
      parentStable: null,
      kind: "set-up",
      label: "EDIM Set-up",
      position: 0,
      createdBy: IDS.ownerB,
    },
    {
      stableId: IDS.b_mod,
      tenantId: IDS.tenantB,
      parentStable: IDS.b_root,
      kind: "module",
      label: "AHU-B",
      position: 0,
      createdBy: IDS.ownerB,
    },
    {
      stableId: IDS.b_item,
      tenantId: IDS.tenantB,
      parentStable: IDS.b_mod,
      kind: "item",
      label: "Heater",
      position: 0,
      createdBy: IDS.ownerB,
    },
  ];
  for (const n of nodes) {
    await adminPrisma.hierarchyNode.create({ data: n });
  }

  console.log("Seed complete: 2 tenants, 3 users, 3 memberships, 6 nodes.");
}

// Self-execute only when run directly (not when imported for IDS/seedAll).
const entry = process.argv[1]?.replace(/\\/g, "/") ?? "";
if (/\/prisma\/seed\.ts$/.test(entry)) {
  seedAll()
    .then(() => adminPrisma.$disconnect())
    .catch(async (err) => {
      console.error(err);
      await adminPrisma.$disconnect();
      process.exit(1);
    });
}
