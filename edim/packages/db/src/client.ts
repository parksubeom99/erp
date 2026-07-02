import { PrismaClient } from "@prisma/client";

/**
 * Two connections, two trust levels:
 *
 *  - adminPrisma  → DATABASE_URL, the schema owner. BYPASSES RLS. Use only for
 *    migrations, seeding, and the auth bootstrap (resolving "which tenants does
 *    this user belong to" before any tenant context exists).
 *
 *  - appPrisma    → APP_DATABASE_URL, the non-superuser `edim_app` role. RLS is
 *    ENFORCED. All tenant-scoped domain work goes through this client, wrapped
 *    in withTenant() (see tenant.ts) so the tenant GUC is set on the same
 *    connection as the queries.
 *
 * Never run tenant-scoped domain queries on adminPrisma.
 *
 * Clients are created lazily on first use (via a Proxy) so that merely importing
 * this module — which happens during `next build` while tracing the module graph
 * — never throws on a missing env var or opens a connection.
 */

const globalForPrisma = globalThis as unknown as {
  adminPrisma?: PrismaClient;
  appPrisma?: PrismaClient;
};

function makeClient(url: string | undefined, label: string): PrismaClient {
  if (!url) {
    throw new Error(
      `[@edim/db] Missing ${label}. Copy .env.example to .env and fill it in.`,
    );
  }
  return new PrismaClient({ datasourceUrl: url });
}

function lazyClient(
  slot: "adminPrisma" | "appPrisma",
  envKey: "DATABASE_URL" | "APP_DATABASE_URL",
): PrismaClient {
  const resolve = (): PrismaClient => {
    const existing = globalForPrisma[slot];
    if (existing) return existing;
    const client = makeClient(process.env[envKey], envKey);
    // Cache in dev to avoid exhausting connections across hot-reloads.
    if (process.env.NODE_ENV !== "production") globalForPrisma[slot] = client;
    return client;
  };

  return new Proxy({} as PrismaClient, {
    get(_target, prop, receiver) {
      const client = resolve();
      const value = Reflect.get(client, prop, receiver);
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
}

export const adminPrisma: PrismaClient = lazyClient(
  "adminPrisma",
  "DATABASE_URL",
);
export const appPrisma: PrismaClient = lazyClient(
  "appPrisma",
  "APP_DATABASE_URL",
);

export type { PrismaClient } from "@prisma/client";
export { Prisma } from "@prisma/client";
