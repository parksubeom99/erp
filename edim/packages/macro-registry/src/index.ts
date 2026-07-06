/**
 * @edim/macro-registry — Part① STEP 5: approval rules + state machine (A7).
 *
 * Dependency rule (non-negotiable): pure. Only @edim/core-ontology; no db, no
 * network. This package holds the *deterministic* half of A7 — who may approve
 * and which state transitions are legal — so both the db domain and apps/web
 * enforce the same rules. Persistence (the Registry table) lives in @edim/db.
 *
 * Two invariants meet here:
 *  - "the LLM is a compiler": a macro may be approved only when it is `verified`
 *    (STEP 4 static verify left no error).
 *  - RBAC: only owner/engineer may approve or reject (owner decision 2026-07-06).
 */
export const MACRO_REGISTRY_PACKAGE = "@edim/macro-registry" as const;
export const REGISTRY_VERSION = "1.0" as const;

export type MacroStatus = "draft" | "approved" | "superseded" | "rejected";

/** Roles permitted to approve or reject a macro. */
export const APPROVER_ROLES: ReadonlySet<string> = new Set(["owner", "engineer"]);

export type ApprovalCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Approval gate: verified AND an authorized role. Both the compiler invariant
 * and RBAC are enforced here, deterministically, with no side effects.
 */
export function canApprove(candidate: { readonly verified: boolean }, role: string): ApprovalCheck {
  if (!APPROVER_ROLES.has(role)) return { ok: false, reason: `role '${role}' may not approve macros` };
  if (!candidate.verified) return { ok: false, reason: "macro is not verified" };
  return { ok: true };
}

/** Rejecting a draft takes the same authority as approving one. */
export function canReject(role: string): ApprovalCheck {
  if (!APPROVER_ROLES.has(role)) return { ok: false, reason: `role '${role}' may not reject macros` };
  return { ok: true };
}

/**
 * Legal transitions. A new approval supersedes the prior approved macro for the
 * same node (draft→approved, old approved→superseded); a draft may be rejected.
 * approved/superseded/rejected are terminal from the state machine's view.
 */
const TRANSITIONS: Record<MacroStatus, readonly MacroStatus[]> = {
  draft: ["approved", "rejected"],
  approved: ["superseded"],
  superseded: [],
  rejected: [],
};

export function canTransition(from: MacroStatus, to: MacroStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
