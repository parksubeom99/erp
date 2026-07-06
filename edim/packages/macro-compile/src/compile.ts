/**
 * @edim/macro-compile — the compile loop (Part① A4, "the LLM is a compiler").
 *
 * natural language → LLM → DSL candidate → parse + static verify. On an error
 * the diagnostics are fed back to the LLM and it retries, up to maxRetries. A
 * candidate is `verified` only when static verification leaves NO error
 * (reserved-token *warnings* are allowed — they never block, matching the
 * verifier's approval gate). The raw LLM text is never executed here; execution
 * stays in the runtime, after approval.
 *
 * Return contract (owner decision 2026-07-06 — transparent): even after the
 * retries are exhausted, the last candidate and its diagnostics are returned
 * with `verified: false`, so nothing is hidden — but a downstream approval step
 * must gate on `verified === true`, so an unverified macro can never slip
 * through. `llmError` is set only on a transport-level client failure.
 */
import type { Diagnostic, VerifyContext } from "@edim/macro-verify";
import { hasErrors, verify } from "@edim/macro-verify";
import type { LLMClient } from "./client";
import { SYSTEM_PROMPT, buildRetryPrompt, buildUserPrompt } from "./prompt";

export interface CompileOptions {
  /** Max feedback retries after the first attempt. Default 2 → up to 3 LLM calls. */
  readonly maxRetries?: number;
}

export interface CompileResult {
  /** The last candidate the LLM produced, or null if it never returned text. */
  readonly dsl: string | null;
  /** True iff a candidate passed static verification with no errors. */
  readonly verified: boolean;
  /** Diagnostics for the final candidate (empty or warnings-only when verified). */
  readonly diagnostics: readonly Diagnostic[];
  /** Number of LLM calls made. */
  readonly attempts: number;
  /** Transport-level client failure, distinct from verifier diagnostics. */
  readonly llmError?: string;
}

export async function compile(
  request: string,
  ctx: VerifyContext,
  client: LLMClient,
  options: CompileOptions = {},
): Promise<CompileResult> {
  const maxRetries = options.maxRetries ?? 2;
  let user = buildUserPrompt(request);
  let lastDsl: string | null = null;
  let lastDiagnostics: readonly Diagnostic[] = [];
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const res = await client.complete({ system: SYSTEM_PROMPT, user });
    attempts += 1;
    if (!res.ok) {
      return { dsl: lastDsl, verified: false, diagnostics: lastDiagnostics, attempts, llmError: res.error };
    }

    const dsl = res.text.trim();
    lastDsl = dsl;
    const diagnostics = verify(dsl, ctx);
    lastDiagnostics = diagnostics;

    if (!hasErrors(diagnostics)) {
      return { dsl, verified: true, diagnostics, attempts };
    }
    user = buildRetryPrompt(request, dsl, diagnostics);
  }

  return { dsl: lastDsl, verified: false, diagnostics: lastDiagnostics, attempts };
}
