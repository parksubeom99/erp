import { withTenantSession } from "@edim/auth";
import { getTree } from "@edim/db";
import type { HierarchyTreeNode } from "@edim/core-ontology";
import { getServerSession } from "./session";

/**
 * The current tenant's Hierarchy tree, or null when unauthenticated. Runs the
 * recursive-CTE query under the session's RLS context. Consumed by the tree API
 * route and (STEP 4) the Hierarchy rail.
 */
export async function getTreeForSession(): Promise<HierarchyTreeNode[] | null> {
  const session = await getServerSession();
  if (!session) return null;
  return withTenantSession(session, (tx) => getTree(tx));
}
