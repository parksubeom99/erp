/**
 * @edim/hierarchy-address — Part① STEP 2 pure Address Resolver.
 *
 * Dependency rule (non-negotiable): imports NOTHING from higher layers. Only
 * @edim/core-ontology. No db, no LLM, no framework. The db-backed, RLS-scoped
 * adapter is in apps/web (app/lib/macro/address.ts).
 *
 * Public surface:
 *   parseUri(uri)                      → Result<ParsedUri>
 *   resolveUri(tree, uri, opts?)       → Result<StableId>
 *   resolveInTree(tree, parsed, opts?) → Result<StableId>
 *   toUri(tree, stableId, tenantId)    → Result<uri>
 *   slug(label)                        → canonical segment
 */
export const HIERARCHY_ADDRESS_PACKAGE = "@edim/hierarchy-address" as const;
export const ADDRESS_VERSION = "1.0" as const;

export { parseUri, buildUri } from "./uri";
export type { ParsedUri } from "./uri";
export { resolveUri, resolveInTree, toUri } from "./resolver";
export type { ResolveOptions } from "./resolver";
export { slug } from "./slug";
export type { Result, AddressError, AddressErrorCode } from "./errors";
