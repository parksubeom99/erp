/**
 * @edim/hierarchy-address — result + closed-world error model.
 *
 * Dependency rule (non-negotiable): imports NOTHING from higher layers. Only
 * @edim/core-ontology is permitted. Pure: no db, no I/O, no framework.
 *
 * STEP 2 mirrors STEP 1's closed-world stance: address resolution never guesses.
 * A path that matches two siblings is AMBIGUOUS, not silently first-wins.
 */

export type AddressErrorCode =
  | "ADDRESS_PARSE_ERROR" // malformed edim:// URI
  | "UNKNOWN_ADDRESS" // no node matches a path segment
  | "AMBIGUOUS_ADDRESS" // >1 sibling matches a segment (no silent pick)
  | "CROSS_TENANT"; // URI tenant ≠ the tree's tenant

export interface AddressError {
  readonly code: AddressErrorCode;
  readonly message: string;
  /** For parse errors: 0-based character index in the URI. */
  readonly index?: number;
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AddressError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T>(code: AddressErrorCode, message: string, index?: number): Result<T> {
  return { ok: false, error: index === undefined ? { code, message } : { code, message, index } };
}
