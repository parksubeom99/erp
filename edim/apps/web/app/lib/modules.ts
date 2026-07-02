import type { Role } from "@edim/core-ontology";

/**
 * The EDIM module menu (handoff §5.4). `roles` is the allowlist consulted in
 * STEP 5 for RBAC gating — defined now so the data model is stable; in STEP 4
 * the menu renders in full.
 */
export interface ModuleDef {
  key: string;
  label: string;
  roles: readonly Role[]; // roles permitted to see/enter this module
}

const ALL: readonly Role[] = ["owner", "engineer", "cad", "sales", "viewer"];

export const MODULES: ModuleDef[] = [
  { key: "toolbox", label: "EDIM Toolbox", roles: ALL },
  { key: "cpq", label: "CPQ", roles: ["owner", "engineer", "sales"] },
  { key: "plm", label: "PLM", roles: ["owner", "engineer", "cad"] },
  { key: "sales", label: "Sales", roles: ["owner", "sales"] },
  { key: "tech", label: "Tech", roles: ["owner", "engineer", "cad"] },
  { key: "purchasing", label: "Purchasing", roles: ["owner", "engineer"] },
  { key: "material", label: "Material", roles: ["owner", "engineer"] },
  { key: "product", label: "Product", roles: ["owner", "engineer"] },
  { key: "qc", label: "QC", roles: ["owner", "engineer"] },
  { key: "as", label: "A/S", roles: ["owner", "sales"] },
  { key: "finance", label: "Finance", roles: ["owner"] },
  { key: "hr", label: "HR", roles: ["owner"] },
  { key: "company", label: "Company Info.", roles: ALL },
];

export function modulesForRole(role: Role): ModuleDef[] {
  return MODULES.filter((m) => m.roles.includes(role));
}

export function getModule(key: string): ModuleDef | undefined {
  return MODULES.find((m) => m.key === key);
}

/** Authoritative access check — used by both the menu and the server guards. */
export function canAccessModule(role: Role, key: string): boolean {
  const m = getModule(key);
  return !!m && m.roles.includes(role);
}
