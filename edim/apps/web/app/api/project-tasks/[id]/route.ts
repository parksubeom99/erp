import { NextResponse, type NextRequest } from "next/server";
import { withTenantSession } from "@edim/auth";
import { setTaskState } from "@edim/db";
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
  const body = (await req.json().catch(() => ({}))) as { state?: unknown };
  if (body.state !== "todo" && body.state !== "done")
    return NextResponse.json({ error: "invalid state" }, { status: 400 });

  await withTenantSession(session, (tx) =>
    setTaskState(tx, id, body.state as "todo" | "done", session.userId),
  );
  return NextResponse.json({ ok: true });
}
