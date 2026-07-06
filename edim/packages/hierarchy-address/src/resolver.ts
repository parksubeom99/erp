/**
 * @edim/hierarchy-address — bidirectional resolver over a Hierarchy tree.
 *
 * Operates purely on `HierarchyTreeNode[]` (core-ontology) — the same shape the
 * db package's recursive-CTE query yields via `buildTree`. No db here: the
 * db-backed, RLS-scoped adapter lives in apps/web (STEP 2 §4).
 *
 *   resolveUri(tree, "edim://tenant/T/ahu-01/cooling-coil") → StableId
 *   toUri(tree, stableId, "T")                              → "edim://tenant/T/..."
 *
 * Guarantees: round-trip `resolveUri(tree, toUri(tree, x, T), {tenantId:T}) === x`
 * for every node of a tree with no sibling-slug collisions.
 */
import type { HierarchyTreeNode } from "@edim/core-ontology";
import type { ParsedUri } from "./uri";
import { buildUri, parseUri } from "./uri";
import type { Result } from "./errors";
import { err, ok } from "./errors";
import { slug } from "./slug";

export interface ResolveOptions {
  /** Tenant owning `tree`; if the URI names another tenant → CROSS_TENANT. */
  readonly tenantId?: string;
  /** Leading namespace segments to consume before tree matching (e.g. ["plm"]). */
  readonly prefix?: readonly string[];
}

function flatten(tree: readonly HierarchyTreeNode[]): Map<string, HierarchyTreeNode> {
  const map = new Map<string, HierarchyTreeNode>();
  const walk = (nodes: readonly HierarchyTreeNode[]): void => {
    for (const n of nodes) {
      map.set(n.stableId, n);
      walk(n.children);
    }
  };
  walk(tree);
  return map;
}

/** Resolve a parsed URI to a node's StableId within `tree`. */
export function resolveInTree(
  tree: readonly HierarchyTreeNode[],
  parsed: ParsedUri,
  options: ResolveOptions = {},
): Result<string> {
  if (options.tenantId !== undefined && parsed.tenantId !== options.tenantId) {
    return err("CROSS_TENANT", `URI tenant '${parsed.tenantId}' ≠ tree tenant '${options.tenantId}'`);
  }

  let segments = parsed.segments;
  const prefix = options.prefix ?? [];
  for (let i = 0; i < prefix.length; i++) {
    const want = slug(prefix[i] as string);
    const got = segments[i];
    if (got === undefined || slug(got) !== want) {
      return err("UNKNOWN_ADDRESS", `expected namespace segment '${want}'`);
    }
  }
  segments = segments.slice(prefix.length);

  if (segments.length === 0) {
    return err("UNKNOWN_ADDRESS", "path addresses no node");
  }

  let level: readonly HierarchyTreeNode[] = tree;
  let found: HierarchyTreeNode | undefined;
  for (const seg of segments) {
    const target = slug(seg);
    const matches = level.filter((n) => slug(n.label) === target);
    if (matches.length === 0) {
      return err("UNKNOWN_ADDRESS", `no node matches segment '${target}'`);
    }
    if (matches.length > 1) {
      return err("AMBIGUOUS_ADDRESS", `segment '${target}' matches ${matches.length} siblings`);
    }
    found = matches[0] as HierarchyTreeNode;
    level = found.children;
  }
  return ok((found as HierarchyTreeNode).stableId);
}

/** Parse then resolve a URI string. */
export function resolveUri(
  tree: readonly HierarchyTreeNode[],
  uri: string,
  options: ResolveOptions = {},
): Result<string> {
  const parsed = parseUri(uri);
  if (!parsed.ok) return parsed;
  return resolveInTree(tree, parsed.value, options);
}

/** Build the canonical edim:// URI addressing `stableId` within `tree`. */
export function toUri(
  tree: readonly HierarchyTreeNode[],
  stableId: string,
  tenantId: string,
  prefix: readonly string[] = [],
): Result<string> {
  const map = flatten(tree);
  const node = map.get(stableId);
  if (!node) return err("UNKNOWN_ADDRESS", `node '${stableId}' is not in the tree`);

  const segs: string[] = [];
  let cur: HierarchyTreeNode | undefined = node;
  while (cur) {
    segs.unshift(slug(cur.label));
    cur = cur.parentStable ? map.get(cur.parentStable) : undefined;
  }
  return ok(buildUri(tenantId, [...prefix.map(slug), ...segs]));
}
