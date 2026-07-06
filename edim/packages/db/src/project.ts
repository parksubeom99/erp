import type {
  ProjectType,
  SalesStage,
  TaskState,
  ApprovalState,
} from "@edim/core-ontology";
import type { TenantClient } from "./tenant";
import { requireTenant } from "./tenant";
import { writeAudit } from "./audit";
import { createNode } from "./hierarchy";

/**
 * Project domain (handoff §3.1 / STEP A1). Follows the hierarchy.ts pattern:
 * every function runs inside a withTenant() tx (RLS auto-scopes to the tenant),
 * and every mutation records an audit_log row.
 *
 * A Project is the detail table for a Hierarchy node of kind='project'
 * (Hierarchy = address, table = detail). createProject creates both: the node
 * (so it appears in the tree) and the project row (attributes), linked by
 * hierarchy_stable = the node's stable_id.
 */

export interface CreateProjectInput {
  parentStable: string | null; // where the project node hangs in the tree
  projectNo: string;
  name: string;
  type: ProjectType;
  clientName?: string | null;
  clientContact?: string | null;
  itemType?: string | null;
  salesStage?: SalesStage;
  createdBy: string;
}

export async function createProject(
  tx: TenantClient,
  input: CreateProjectInput,
): Promise<{ id: string; hierarchyStable: string }> {
  const tenantId = await requireTenant(tx);

  // 1) tree node (kind='project') so the project is addressable in the rail
  const hierarchyStable = await createNode(tx, {
    parentStable: input.parentStable,
    kind: "project",
    label: `${input.projectNo} ${input.name}`,
    createdBy: input.createdBy,
  });

  // 2) detail row
  const project = await tx.project.create({
    data: {
      tenantId,
      hierarchyStable,
      projectNo: input.projectNo,
      name: input.name,
      type: input.type,
      clientName: input.clientName ?? null,
      clientContact: input.clientContact ?? null,
      itemType: input.itemType ?? null,
      salesStage: input.salesStage ?? "기술제안",
      status: "active",
      createdBy: input.createdBy,
    },
  });

  await writeAudit(tx, input.createdBy, "create", "project", project.id, null, {
    projectNo: input.projectNo,
    name: input.name,
    type: input.type,
    salesStage: project.salesStage,
  });
  return { id: project.id, hierarchyStable };
}

export function getProject(tx: TenantClient, id: string) {
  return tx.project.findUnique({ where: { id } });
}

/** Look up a project by its hierarchy node stable_id (rail click → detail). */
export function getProjectByStable(tx: TenantClient, hierarchyStable: string) {
  return tx.project.findFirst({ where: { hierarchyStable } });
}

export function listProjects(tx: TenantClient) {
  return tx.project.findMany({ orderBy: { createdAt: "asc" } });
}

export interface UpdateProjectPatch {
  name?: string;
  clientName?: string | null;
  clientContact?: string | null;
  itemType?: string | null;
}

export async function updateProject(
  tx: TenantClient,
  id: string,
  patch: UpdateProjectPatch,
  actorId: string,
): Promise<void> {
  const before = await tx.project.findUniqueOrThrow({ where: { id } });
  const after = await tx.project.update({ where: { id }, data: patch });
  await writeAudit(
    tx,
    actorId,
    "update",
    "project",
    id,
    {
      name: before.name,
      clientName: before.clientName,
      clientContact: before.clientContact,
      itemType: before.itemType,
    },
    {
      name: after.name,
      clientName: after.clientName,
      clientContact: after.clientContact,
      itemType: after.itemType,
    },
  );
}

export async function setSalesStage(
  tx: TenantClient,
  id: string,
  stage: SalesStage,
  actorId: string,
): Promise<void> {
  const before = await tx.project.findUniqueOrThrow({ where: { id } });
  await tx.project.update({ where: { id }, data: { salesStage: stage } });
  await writeAudit(
    tx,
    actorId,
    "update",
    "project",
    id,
    { salesStage: before.salesStage },
    { salesStage: stage },
  );
}

export async function closeProject(
  tx: TenantClient,
  id: string,
  actorId: string,
): Promise<void> {
  const before = await tx.project.findUniqueOrThrow({ where: { id } });
  await tx.project.update({ where: { id }, data: { status: "closed" } });
  await writeAudit(
    tx,
    actorId,
    "update",
    "project",
    id,
    { status: before.status },
    { status: "closed" },
  );
}

// --- Tasks (Schedule) -------------------------------------------------------

export function listTasks(tx: TenantClient, projectId: string) {
  return tx.projectTask.findMany({
    where: { projectId },
    orderBy: [{ state: "asc" }, { createdAt: "asc" }],
  });
}

export async function addTask(
  tx: TenantClient,
  projectId: string,
  title: string,
  dueAt: Date | null,
  actorId: string,
): Promise<string> {
  const tenantId = await requireTenant(tx);
  const task = await tx.projectTask.create({
    data: { tenantId, projectId, title, state: "todo", dueAt },
  });
  await writeAudit(tx, actorId, "create", "project_task", task.id, null, {
    projectId,
    title,
    state: "todo",
  });
  return task.id;
}

export async function setTaskState(
  tx: TenantClient,
  taskId: string,
  state: TaskState,
  actorId: string,
): Promise<void> {
  const before = await tx.projectTask.findUniqueOrThrow({
    where: { id: taskId },
  });
  await tx.projectTask.update({ where: { id: taskId }, data: { state } });
  await writeAudit(
    tx,
    actorId,
    "update",
    "project_task",
    taskId,
    { state: before.state },
    { state },
  );
}

// --- Attachments (Data Up-Load; metadata only) ------------------------------

export function listAttachments(tx: TenantClient, projectId: string) {
  return tx.projectAttachment.findMany({
    where: { projectId },
    orderBy: [{ department: "asc" }, { uploadedAt: "desc" }],
  });
}

export interface AddAttachmentInput {
  projectId: string;
  department: string;
  docType: string;
  name: string;
  description?: string | null;
  fileRef: string;
  uploadedBy: string;
}

export async function addAttachment(
  tx: TenantClient,
  input: AddAttachmentInput,
): Promise<string> {
  const tenantId = await requireTenant(tx);
  const att = await tx.projectAttachment.create({
    data: {
      tenantId,
      projectId: input.projectId,
      department: input.department,
      docType: input.docType,
      name: input.name,
      description: input.description ?? null,
      fileRef: input.fileRef,
      uploadedBy: input.uploadedBy,
    },
  });
  await writeAudit(
    tx,
    input.uploadedBy,
    "create",
    "project_attachment",
    att.id,
    null,
    {
      projectId: input.projectId,
      department: input.department,
      name: input.name,
    },
  );
  return att.id;
}

// --- Approvals --------------------------------------------------------------

export function listApprovals(tx: TenantClient, projectId: string) {
  return tx.projectApproval.findMany({
    where: { projectId },
    orderBy: { requestedAt: "desc" },
  });
}

export async function requestApproval(
  tx: TenantClient,
  projectId: string,
  requesterId: string,
  note: string | null,
): Promise<string> {
  const tenantId = await requireTenant(tx);
  const ap = await tx.projectApproval.create({
    data: { tenantId, projectId, requesterId, state: "requested", note },
  });
  await writeAudit(tx, requesterId, "create", "project_approval", ap.id, null, {
    projectId,
    state: "requested",
  });
  return ap.id;
}

/** Approve/reject. Caller is responsible for the RBAC gate (see app guards). */
export async function decideApproval(
  tx: TenantClient,
  approvalId: string,
  decision: Extract<ApprovalState, "approved" | "rejected">,
  approverId: string,
  note: string | null,
): Promise<void> {
  const before = await tx.projectApproval.findUniqueOrThrow({
    where: { id: approvalId },
  });
  await tx.projectApproval.update({
    where: { id: approvalId },
    data: { state: decision, approverId, note, decidedAt: new Date() },
  });
  await writeAudit(
    tx,
    approverId,
    "update",
    "project_approval",
    approvalId,
    { state: before.state },
    { state: decision },
  );
}
