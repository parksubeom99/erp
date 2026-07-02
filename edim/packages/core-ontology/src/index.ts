/**
 * @edim/core-ontology — pure domain types and rules.
 *
 * Dependency rule (non-negotiable): this package imports NOTHING from higher
 * layers (db, auth, ui, apps). It is the shared vocabulary every other package
 * projects onto. Keep it free of I/O, framework, and runtime concerns.
 *
 * STEP 0 scope: identity primitives only. The Hierarchy node type and its
 * invariant rules arrive in STEP 3. RCCS code segments are deferred until the
 * code grammar is fixed (GAP1) — do not add them here yet.
 */

/**
 * Branded id types. At runtime these are plain strings (uuids); the brand only
 * exists in the type system to stop a TenantId being passed where a StableId is
 * expected. `stable_id` / `revision_id` separation is a core principle: identity
 * is immutable, revision flows.
 */
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type TenantId = Brand<string, "TenantId">;
export type UserId = Brand<string, "UserId">;
export type StableId = Brand<string, "StableId">;
export type RevisionId = Brand<string, "RevisionId">;

/** Roles a membership can carry within a tenant. */
export const ROLES = ["owner", "engineer", "cad", "sales", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

/** Kinds of hierarchy node in the skeleton tree (pre-RCCS). */
export const NODE_KINDS = ["set-up", "user", "erp", "module", "item"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** Narrow, unsafe casts for boundaries where a raw string is known to be an id. */
export const asTenantId = (v: string): TenantId => v as TenantId;
export const asUserId = (v: string): UserId => v as UserId;
export const asStableId = (v: string): StableId => v as StableId;
export const asRevisionId = (v: string): RevisionId => v as RevisionId;

/**
 * A current-revision node as returned by the recursive-CTE tree query — flat,
 * with a computed `depth`. Only the fields the tree UI needs; the full row lives
 * in the db layer.
 */
export interface HierarchyNodeRow {
  stableId: string;
  parentStable: string | null;
  kind: string;
  label: string;
  position: number;
  depth: number;
}

/** Nested form of the tree. */
export interface HierarchyTreeNode extends HierarchyNodeRow {
  children: HierarchyTreeNode[];
}

/**
 * Assemble flat rows into a nested tree. Pure (no I/O), so it belongs here.
 * Rows whose parent is absent from the set become roots (e.g. a soft-deleted
 * ancestor detaches its subtree). Siblings are ordered by `position`.
 */
export function buildTree(rows: HierarchyNodeRow[]): HierarchyTreeNode[] {
  const byId = new Map<string, HierarchyTreeNode>();
  for (const r of rows) byId.set(r.stableId, { ...r, children: [] });

  const roots: HierarchyTreeNode[] = [];
  for (const r of rows) {
    const node = byId.get(r.stableId)!;
    const parent = r.parentStable ? byId.get(r.parentStable) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRec = (nodes: HierarchyTreeNode[]): void => {
    nodes.sort((a, b) => a.position - b.position);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
