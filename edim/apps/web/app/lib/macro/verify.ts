import { verify } from "@edim/macro-verify";
import type { Diagnostic } from "@edim/macro-verify";
import { getServerSession } from "../session";
import { getTreeForSession } from "../hierarchy";

/**
 * STEP 3 db-backed adapter — the ONLY layer that binds the pure
 * @edim/macro-verify checker to the real, RLS-scoped Hierarchy tree.
 *
 * @edim/macro-verify stays pure (core-ontology + macro-dsl + hierarchy-address,
 * no db); this seam lives in apps/web because it is the layer allowed to touch
 * @edim/db (via getTreeForSession → withTenantSession). The URI tenant is always
 * checked against the session tenant, so a cross-tenant address in a macro fails
 * closed as ADDRESS_UNKNOWN before RLS.
 *
 * Returns null when unauthenticated; otherwise the static diagnostics for the
 * candidate macro. The dry-run adapter is deliberately NOT wired here: it needs
 * a db-backed DataProvider (real Table/Var/code values), which is a later STEP —
 * @edim/macro-verify's dryRun(ast, provider) is ready to accept it when it lands.
 */
export async function verifyMacroForSession(source: string): Promise<Diagnostic[] | null> {
  const session = await getServerSession();
  if (!session) return null;
  const tree = await getTreeForSession();
  if (!tree) return null;
  return verify(source, { tree, tenantId: session.tenantId });
}
