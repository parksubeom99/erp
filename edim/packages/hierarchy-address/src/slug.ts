/**
 * @edim/hierarchy-address — segment slug.
 *
 * A URI path segment is derived from a node's `label` (Phase A finding: `kind`
 * is not viable — siblings share it). Normalization is deterministic so that
 * `toUri` and `resolveInTree` agree on the same string:
 *   "EDIM Set-up" → "edim-set-up" · "AHU-01" → "ahu-01" · "Cooling Coil" → "cooling-coil"
 *
 * Unicode letters/numbers are kept (NFKC-folded, lower-cased) so non-ASCII
 * labels still produce a stable, comparable segment. Two siblings that collapse
 * to the same slug are reported as AMBIGUOUS at resolve time — never guessed.
 */
export function slug(label: string): string {
  return label
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
