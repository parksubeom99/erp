import { config } from "dotenv";

// Single source of truth for env: the monorepo-root .env (same file the db/auth
// pnpm scripts read via dotenv-cli). Loaded here so `next dev|build|start` sees
// DATABASE_URL / APP_DATABASE_URL / AUTH_SECRET without duplicating the file.
config({ path: new URL("../../.env", import.meta.url) });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages are shipped as TypeScript source (internal-packages
  // pattern); Next transpiles them instead of expecting a prebuilt dist.
  transpilePackages: [
    "@edim/core-ontology",
    "@edim/db",
    "@edim/auth",
    "@edim/ui",
  ],
};

export default nextConfig;
