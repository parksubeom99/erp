/**
 * @edim/macro-verify — Part① A6 orchestration (deterministic, no LLM).
 *
 * `verify` runs check ① (parse) then the static checks; `review` adds the
 * dry-run preview, but only when the static checks leave no error — the
 * blueprint's "static gate, then Run → N preview". Nothing here touches a DB or
 * an LLM.
 */
import type { DataProvider } from "@edim/macro-dsl";
import { parse } from "@edim/macro-dsl";
import type { Diagnostic } from "./diagnostic";
import { diagnostic, hasErrors } from "./diagnostic";
import type { VerifyContext } from "./static";
import { verifyAst } from "./static";
import type { DryRunResult } from "./dryrun";
import { dryRun } from "./dryrun";

/** Parse (check ①) then run the static checks. */
export function verify(source: string, ctx: VerifyContext): Diagnostic[] {
  const parsed = parse(source);
  if (!parsed.ok) {
    return [diagnostic("error", "PARSE_ERROR", parsed.error.message, parsed.error.position)];
  }
  return verifyAst(parsed.value, ctx);
}

export interface Review {
  readonly diagnostics: readonly Diagnostic[];
  /** null when a static error blocks the preview. */
  readonly dryRun: DryRunResult | null;
}

/** Full A6 pass: static gate, and only if it holds, the dry-run preview. */
export function review(source: string, ctx: VerifyContext, provider: DataProvider): Review {
  const parsed = parse(source);
  if (!parsed.ok) {
    return {
      diagnostics: [diagnostic("error", "PARSE_ERROR", parsed.error.message, parsed.error.position)],
      dryRun: null,
    };
  }
  const diagnostics = verifyAst(parsed.value, ctx);
  if (hasErrors(diagnostics)) return { diagnostics, dryRun: null };
  return { diagnostics, dryRun: dryRun(parsed.value, provider) };
}
