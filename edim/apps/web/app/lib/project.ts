import { withTenantSession } from "@edim/auth";
import {
  getProjectByStable,
  getProject,
  listTasks,
  listAttachments,
  listApprovals,
} from "@edim/db";
import { getServerSession } from "./session";

/**
 * Full project detail for the Main Work Panel: the project row plus its tasks,
 * attachments, and approvals — all under the session's RLS context. Looked up by
 * the hierarchy node's stable_id (the rail click carries ?node=<stable>).
 */
export async function getProjectDetailByStable(hierarchyStable: string) {
  const session = await getServerSession();
  if (!session) return null;
  return withTenantSession(session, async (tx) => {
    const project = await getProjectByStable(tx, hierarchyStable);
    if (!project) return null;
    const [tasks, attachments, approvals] = await Promise.all([
      listTasks(tx, project.id),
      listAttachments(tx, project.id),
      listApprovals(tx, project.id),
    ]);
    return { project, tasks, attachments, approvals };
  });
}

/** For /m/project — the tenant's project list (rail-independent entry point). */
export async function listProjectsForSession() {
  const session = await getServerSession();
  if (!session) return null;
  return withTenantSession(session, async (tx) => {
    const projects = await tx.project.findMany({
      orderBy: { createdAt: "asc" },
    });
    return projects;
  });
}

export type ProjectDetail = NonNullable<
  Awaited<ReturnType<typeof getProjectDetailByStable>>
>;
