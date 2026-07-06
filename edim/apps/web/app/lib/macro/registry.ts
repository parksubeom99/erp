import { canApprove, canReject } from "@edim/macro-registry";
import { approve, createDraft, getApproved, getMacro, listForNode, reject, withTenant } from "@edim/db";
import { hasErrors, verify } from "@edim/macro-verify";
import type { Diagnostic } from "@edim/macro-verify";
import type { CompileResult } from "@edim/macro-compile";
import { getServerSession } from "../session";
import { getTreeForSession } from "../hierarchy";
import { compileMacroForSession } from "./compile";

/**
 * STEP 5 adapter — binds the pure approval rules (@edim/macro-registry) and the
 * Registry persistence (@edim/db, RLS-scoped) to the session. This is the layer
 * that closes the A7 loop: compile (STEP 4) → draft → review → approve.
 *
 * RBAC lives here (owner/engineer via canApprove/canReject); the db enforces the
 * compiler invariant (no unverified approval) independently. Approval re-verifies
 * the stored DSL against the *current* tree, so a tree change since drafting
 * cannot let a now-broken macro through. Returns null when unauthenticated.
 */
export async function proposeMacro(
  stableId: string,
  request: string,
): Promise<{ macroId: string; compile: CompileResult } | null> {
  const session = await getServerSession();
  if (!session) return null;
  const result = await compileMacroForSession(request);
  if (!result || result.dsl === null) return null;
  const dsl = result.dsl;
  const macroId = await withTenant(session.tenantId, (tx) =>
    createDraft(tx, { stableId, dsl, createdBy: session.userId }),
  );
  return { macroId, compile: result };
}

export interface ApprovalOutcome {
  readonly ok: boolean;
  readonly reason?: string;
  readonly diagnostics?: readonly Diagnostic[];
}

export async function approveMacro(macroId: string): Promise<ApprovalOutcome | null> {
  const session = await getServerSession();
  if (!session) return null;
  const tree = await getTreeForSession();
  if (!tree) return null;
  return withTenant(session.tenantId, async (tx): Promise<ApprovalOutcome> => {
    const macro = await getMacro(tx, macroId);
    if (!macro || macro.status !== "draft") return { ok: false, reason: "no draft macro to approve" };
    const diagnostics = verify(macro.dsl, { tree, tenantId: session.tenantId });
    const verified = !hasErrors(diagnostics);
    const gate = canApprove({ verified }, session.role);
    if (!gate.ok) return { ok: false, reason: gate.reason, diagnostics };
    await approve(tx, { id: macroId, approvedBy: session.userId, verified });
    return { ok: true };
  });
}

export async function rejectMacro(macroId: string): Promise<ApprovalOutcome | null> {
  const session = await getServerSession();
  if (!session) return null;
  const gate = canReject(session.role);
  if (!gate.ok) return { ok: false, reason: gate.reason };
  await withTenant(session.tenantId, (tx) => reject(tx, { id: macroId, rejectedBy: session.userId }));
  return { ok: true };
}

export async function listMacros(stableId: string) {
  const session = await getServerSession();
  if (!session) return null;
  return withTenant(session.tenantId, (tx) => listForNode(tx, stableId));
}

export async function approvedMacro(stableId: string) {
  const session = await getServerSession();
  if (!session) return null;
  return withTenant(session.tenantId, (tx) => getApproved(tx, stableId));
}
