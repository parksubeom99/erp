import type { Prisma, PrismaClient } from "@prisma/client";
import type { TenantId } from "@edim/core-ontology";
import { appPrisma } from "./client";

/**
 * The transaction client handed to withTenant() callbacks. It is a normal
 * Prisma client minus the connection-management methods that can't be called
 * inside an interactive transaction.
 */
export type TenantClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

/**
 * Run `fn` with Postgres RLS scoped to `tenantId`.
 *
 * This is the Prisma analog of the doc's "GUC injection transaction hook": open
 * an interactive transaction on the RLS-enforced app client, set
 * `app.current_tenant` LOCAL to that transaction (so it auto-resets and never
 * leaks to a pooled connection), then run the caller's queries on the same
 * connection. Every tenant-scoped read/write must go through here.
 *
 * set_config(key, value, is_local=true) ties the GUC to the transaction.
 */
export async function withTenant<T>(
  tenantId: TenantId | string,
  fn: (tx: TenantClient) => Promise<T>,
): Promise<T> {
  return appPrisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant', ${String(
      tenantId,
    )}, true)`;
    return fn(tx as unknown as TenantClient);
  });
}

/** Escape hatch for tests/tools: read the GUC currently visible to a tx. */
export async function currentTenantOf(
  tx: Pick<TenantClient, "$queryRaw">,
): Promise<string | null> {
  const rows = await tx.$queryRaw<{ tenant: string | null }[]>`
    SELECT NULLIF(current_setting('app.current_tenant', true), '') AS tenant`;
  return rows[0]?.tenant ?? null;
}

/** Like currentTenantOf but throws if no tenant context is set. */
export async function requireTenant(
  tx: Pick<TenantClient, "$queryRaw">,
): Promise<string> {
  const t = await currentTenantOf(tx);
  if (!t)
    throw new Error("[@edim/db] no tenant context (app.current_tenant unset)");
  return t;
}

export type { Prisma };
