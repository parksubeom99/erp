import { NextResponse } from "next/server";
import { getTreeForSession } from "@/app/lib/hierarchy";

/** GET the current tenant's Hierarchy tree (401 when unauthenticated). */
export async function GET() {
  const tree = await getTreeForSession();
  if (!tree) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ tree });
}
