import { NextResponse } from "next/server";
import { getServerSession } from "@/app/lib/session";
import { getModule, canAccessModule } from "@/app/lib/modules";

/**
 * Server-side module gate (handoff §STEP 5): hiding a menu item is not enough —
 * a direct request must also be blocked. viewer → /api/modules/finance ⇒ 403.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const { key } = await params;
  const session = await getServerSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!getModule(key)) {
    return NextResponse.json({ error: "unknown module" }, { status: 404 });
  }
  if (!canAccessModule(session.role, key)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const mod = getModule(key)!;
  return NextResponse.json({ key: mod.key, label: mod.label });
}
