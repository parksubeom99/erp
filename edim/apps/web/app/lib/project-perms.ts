import type { Role } from "@edim/core-ontology";

/**
 * Project RBAC (handoff §A3/§A5). viewer is read-only; editing (stage / tasks /
 * attachments / requesting approval) needs an edit role; deciding an approval is
 * the tightest gate. These are enforced server-side in the API routes and used
 * to hide controls client-side.
 */
export const PROJECT_EDIT_ROLES: readonly Role[] = [
  "owner",
  "engineer",
  "sales",
];
export const PROJECT_DECIDE_ROLES: readonly Role[] = ["owner", "engineer"];

export const canEditProject = (role: Role): boolean =>
  PROJECT_EDIT_ROLES.includes(role);
export const canDecideApproval = (role: Role): boolean =>
  PROJECT_DECIDE_ROLES.includes(role);
