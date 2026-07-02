import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "@/app/lib/session";

/**
 * Auth boundary for the app shell. Unauthenticated (or invalid-membership)
 * requests are redirected to /login before any tenant-scoped content renders.
 * The 3-panel Main Form shell (STEP 4) will be composed inside here.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession();
  if (!session) redirect("/login");
  return children;
}
