import { NextResponse, type NextRequest } from "next/server";
import { withTenantSession } from "@edim/auth";
import { addTask } from "@edim/db";
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
  const body = (await req.json().catch(() => ({}))) as {
    title?: unknown;
    dueAt?: unknown;
  };
  if (typeof body.title !== "string" || body.title.trim() === "")
    return NextResponse.json({ error: "title required" }, { status: 400 });
  const dueAt = typeof body.dueAt === "string" ? new Date(body.dueAt) : null;

  await withTenantSession(session, (tx) =>
    addTask(tx, id, body.title as string, dueAt, session.userId),
  );
  return NextResponse.json({ ok: true });
}
