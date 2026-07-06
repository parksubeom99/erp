import { resolveUri, toUri } from "@edim/hierarchy-address";
import type { Result } from "@edim/hierarchy-address";
import { getServerSession } from "../session";
import { getTreeForSession } from "../hierarchy";

/**
 * STEP 2 db-backed adapter — the ONLY layer that binds the pure
 * @edim/hierarchy-address resolver to the real, RLS-scoped Hierarchy tree.
 *
 * macro-dsl stays pure (core-ontology only) and the resolver package stays db-
 * free; this seam lives in apps/web because it is the layer allowed to touch
 * @edim/db (via getTreeForSession → withTenantSession). The URI tenant is
 * always checked against the session tenant, so a cross-tenant address fails
 * closed even before RLS.
 *
 * Returns null when unauthenticated; otherwise a Result carrying the StableId
 * (or canonical URI) or a closed-world address error.
 */
export async function resolveAddressForSession(uri: string): Promise<Result<string> | null> {
  const session = await getServerSession();
  if (!session) return null;
  const tree = await getTreeForSession();
  if (!tree) return null;
  return resolveUri(tree, uri, { tenantId: session.tenantId });
}

export async function uriForNodeForSession(stableId: string): Promise<Result<string> | null> {
  const session = await getServerSession();
  if (!session) return null;
  const tree = await getTreeForSession();
  if (!tree) return null;
  return toUri(tree, stableId, session.tenantId);
}
