import { NextResponse, type NextRequest } from "next/server";
import { withTenantSession } from "@edim/auth";
import { requestApproval } from "@edim/db";
import { getServerSession } from "@/app/lib/session";
import { canEditProject } from "@/app/lib/project-perms";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditProject(session.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { note?: unknown };
  const note = typeof body.note === "string" ? body.note : null;

  await withTenantSession(session, (tx) =>
    requestApproval(tx, id, session.userId, note),
  );
  return NextResponse.json({ ok: true });
}
