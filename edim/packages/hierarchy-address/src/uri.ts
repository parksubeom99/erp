/**
 * @edim/hierarchy-address — edim:// URI parse + build.
 *
 * Surface form (corpus EDIM_HIERARCHY_ADDRESS_CODE_MODEL.md):
 *   edim://tenant/{tenantId}/{seg}/{seg}...
 *
 * v1.0 boundary: only the `tenant` authority is understood. Corpus URIs may
 * carry a fixed namespace prefix (e.g. `.../plm/...`) that the current schema
 * does not model (no hierarchy_definition_id — D-S2-2). The caller may pass
 * `prefix` to consume/verify such leading segments before tree matching;
 * default is none, matching the seed tree directly.
 */
import type { Result } from "./errors";
import { err, ok } from "./errors";

const SCHEME = "edim://tenant/";

export interface ParsedUri {
  readonly tenantId: string;
  readonly segments: readonly string[];
}

export function parseUri(uri: string): Result<ParsedUri> {
  if (!uri.startsWith(SCHEME)) {
    return err("ADDRESS_PARSE_ERROR", `URI must start with '${SCHEME}'`, 0);
  }
  const rest = uri.slice(SCHEME.length).replace(/\/+$/, ""); // drop trailing slash
  const parts = rest.split("/");
  const tenantId = parts[0] ?? "";
  if (tenantId.length === 0) {
    return err("ADDRESS_PARSE_ERROR", "missing tenant id", SCHEME.length);
  }
  const segments = parts.slice(1);
  if (segments.some((s) => s.length === 0)) {
    return err("ADDRESS_PARSE_ERROR", "empty path segment", SCHEME.length);
  }
  return ok({ tenantId, segments });
}

/** Build a canonical URI from a tenant id and already-slugged segments. */
export function buildUri(tenantId: string, segments: readonly string[]): string {
  return SCHEME + [tenantId, ...segments].join("/");
}
