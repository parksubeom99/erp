import { NextResponse, type NextRequest } from "next/server";
import { withTenantSession } from "@edim/auth";
import { addAttachment } from "@edim/db";
import { getServerSession } from "@/app/lib/session";
import { canEditProject } from "@/app/lib/project-perms";

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canEditProject(session.role))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const projectId = b.projectId;
  const department = b.department;
  const docType = b.docType;
  const name = b.name;
  if (
    typeof projectId !== "string" ||
    typeof department !== "string" ||
    typeof docType !== "string" ||
    typeof name !== "string"
  ) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  await withTenantSession(session, (tx) =>
    addAttachment(tx, {
      projectId,
      department,
      docType,
      name,
      description: typeof b.description === "string" ? b.description : null,
      fileRef: typeof b.fileRef === "string" ? b.fileRef : "(pending)",
      uploadedBy: session.userId,
    }),
  );
  return NextResponse.json({ ok: true });
}
