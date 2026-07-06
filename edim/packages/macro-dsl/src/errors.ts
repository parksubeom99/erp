/**
 * @edim/macro-dsl — closed-world error model.
 *
 * Dependency rule (non-negotiable): this package imports NOTHING from higher
 * layers (db, auth, ui, apps). It may only import @edim/core-ontology.
 *
 * Part① first principle: "the LLM is a compiler". Only *approved* formulae run,
 * and the runtime never guesses. Every failure is one of a small, closed set of
 * codes — no silent fallbacks, no plausible-but-wrong interpretation. In
 * particular the three tokens whose meaning the blueprint never defined
 * (PreC arg, Table 3rd arg, Var namespace) are *parsed* but refuse to *execute*.
 */

/** Source position (1-based line, 1-based column). */
export interface Position {
  readonly line: number;
  readonly col: number;
}

/**
 * The complete, closed set of failure codes.
 * - PARSE_ERROR    — malformed macro text (always carries a position)
 * - UNKNOWN_SYMBOL — a Table / Var / address / code the provider cannot resolve
 * - RESERVED_FN    — a function whose semantics are undefined (PreC)
 * - RESERVED_ARG   — an argument slot whose semantics are undefined
 *                    (Table aux / Var namespace `FES`)
 * - TYPE_ERROR     — a well-formed macro used with incompatible value types
 */
export type MacroErrorCode =
  | "PARSE_ERROR"
  | "UNKNOWN_SYMBOL"
  | "RESERVED_FN"
  | "RESERVED_ARG"
  | "TYPE_ERROR";

export interface MacroError {
  readonly code: MacroErrorCode;
  readonly message: string;
  /** Present for PARSE_ERROR and any error anchored to a token. */
  readonly position?: Position;
}

/** Result of a fallible operation. No exceptions escape the public API. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: MacroError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(
  code: MacroErrorCode,
  message: string,
  position?: Position,
): Result<T> {
  return { ok: false, error: position ? { code, message, position } : { code, message } };
}

/**
 * Reserved tokens — parsed but never executed until NOVA/Ian confirm their
 * meaning (blueprint gaps). Kept as data so tests and the executor agree.
 */
export const RESERVED_VAR_NAMESPACES: ReadonlySet<string> = new Set(["FES"]);
