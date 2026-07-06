import { NextResponse, type NextRequest } from "next/server";
import { isSalesStage } from "@edim/core-ontology";
import { withTenantSession } from "@edim/auth";
import { setSalesStage } from "@edim/db";
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
  const body = (await req.json().catch(() => ({}))) as { stage?: unknown };
  const stage = body.stage;
  if (typeof stage !== "string" || !isSalesStage(stage))
    return NextResponse.json({ error: "invalid stage" }, { status: 400 });

  await withTenantSession(session, (tx) =>
    setSalesStage(tx, id, stage, session.userId),
  );
  return NextResponse.json({ ok: true });
}
