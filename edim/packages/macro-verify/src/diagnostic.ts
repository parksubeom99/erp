/**
 * @edim/macro-verify — diagnostics (Part① A6 output model).
 *
 * A6 turns a macro candidate into a flat, closed list of diagnostics *before*
 * approval — no free text, no inference. Severity is pass / warning / error: a
 * single `error` closes the approval gate; a `warning` surfaces a reserved,
 * undefined-spec token (a NOVA gap) without blocking the author from seeing the
 * rest of the report.
 */
import type { Position } from "@edim/macro-dsl";

export type Severity = "pass" | "warning" | "error";

/**
 * The complete, closed diagnostic-code set. `ADDRESS_UNKNOWN` is the *static*
 * tree check (A2 resolver) and is deliberately distinct from `UNKNOWN_SYMBOL`,
 * the *dry-run* provider miss — the two fail at different layers.
 */
export type DiagnosticCode =
  | "PARSE_ERROR"
  | "ADDRESS_UNKNOWN"
  | "TYPE_ERROR"
  | "RESERVED_FN"
  | "RESERVED_ARG"
  | "UNKNOWN_SYMBOL";

export interface Diagnostic {
  readonly severity: Severity;
  readonly code: DiagnosticCode;
  readonly message: string;
  readonly position?: Position;
}

export function diagnostic(
  severity: Severity,
  code: DiagnosticCode,
  message: string,
  position?: Position,
): Diagnostic {
  return position ? { severity, code, message, position } : { severity, code, message };
}

/** True when any diagnostic is an error — the approval gate is closed. */
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}
