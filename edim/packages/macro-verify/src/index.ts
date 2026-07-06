/**
 * @edim/macro-verify — Part① STEP 3: A6 Verifier + Dry-run (deterministic).
 *
 * Dependency rule (non-negotiable): imports NOTHING from higher layers. Only
 * @edim/core-ontology, @edim/macro-dsl (AST + executor) and
 * @edim/hierarchy-address (A2 resolver). No db, no LLM, no framework — the
 * db-backed adapter lives in apps/web.
 *
 * Public surface:
 *   verify(source, ctx)           → Diagnostic[]   (parse + static checks)
 *   verifyAst(ast, ctx)           → Diagnostic[]   (static checks only)
 *   dryRun(ast, provider)         → DryRunResult   (numeric preview)
 *   review(source, ctx, provider) → Review         (static gate → preview)
 */
export const MACRO_VERIFY_PACKAGE = "@edim/macro-verify" as const;
export const VERIFY_VERSION = "1.0" as const;

export { verify, review } from "./verify";
export type { Review } from "./verify";
export { verifyAst, checkCycles } from "./static";
export type { VerifyContext } from "./static";
export { dryRun } from "./dryrun";
export type { DryRunResult } from "./dryrun";
export { diagnostic, hasErrors } from "./diagnostic";
export type { Diagnostic, DiagnosticCode, Severity } from "./diagnostic";
