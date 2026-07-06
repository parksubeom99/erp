/**
 * @edim/macro-verify — dry-run (Part① A6 numeric preview).
 *
 * Runs the *real* @edim/macro-dsl executor against injected sample data, so the
 * preview can never diverge from runtime — the executor stays the single source
 * of truth and is not re-implemented here, only wrapped. Reserved tokens the
 * executor hard-fails are surfaced as *warnings* (consistent with the static
 * pass); genuine misses stay errors.
 *
 * A full per-node trace is deferred (it would require instrumenting the
 * executor — a separate change); v1.0 returns the final value plus a
 * blueprint-style "Run → N" preview.
 */
import type { DataProvider, EvalValue, Macro } from "@edim/macro-dsl";
import { evaluate } from "@edim/macro-dsl";
import type { Diagnostic } from "./diagnostic";
import { diagnostic } from "./diagnostic";

export interface DryRunResult {
  readonly ok: boolean;
  readonly value?: EvalValue;
  /** Blueprint-style numeric preview, e.g. "Run → 786". */
  readonly preview?: string;
  /** Present when evaluation did not produce a value. */
  readonly diagnostic?: Diagnostic;
}

export function dryRun(macro: Macro, provider: DataProvider): DryRunResult {
  const r = evaluate(macro, provider);
  if (r.ok) {
    return { ok: true, value: r.value, preview: `Run → ${format(r.value)}` };
  }
  const severity = r.error.code === "RESERVED_FN" || r.error.code === "RESERVED_ARG" ? "warning" : "error";
  return { ok: false, diagnostic: diagnostic(severity, r.error.code, r.error.message, r.error.position) };
}

function format(value: EvalValue): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  return `[${value.join(", ")}]`;
}
