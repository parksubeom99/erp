import { AppShell, ThemeToggle, CodeChip } from "@edim/ui";
import { getServerSession } from "@/app/lib/session";
import { getTreeForSession } from "@/app/lib/hierarchy";
import { getProjectDetailByStable } from "@/app/lib/project";
import { modulesForRole } from "@/app/lib/modules";
import { canEditProject, canDecideApproval } from "@/app/lib/project-perms";
import { ModuleMenu } from "./module-menu";
import { HierarchyTree } from "./hierarchy-tree";
import { SignOutButton } from "./sign-out-button";
import { ProjectDetail, type ProjectView } from "./project-detail";

/**
 * Main Form shell. When a Hierarchy node of kind='project' is selected
 * (?node=<stable>), its detail renders in the Main Work Panel; otherwise the
 * Overview placeholder. Everything is server-rendered under the session's RLS.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ node?: string }>;
}) {
  const session = await getServerSession();
  const tree = (await getTreeForSession()) ?? [];
  const { node } = await searchParams;
  const detail = node ? await getProjectDetailByStable(node) : null;

  const main =
    detail && session ? (
      <ProjectDetail
        p={toView(detail)}
        canEdit={canEditProject(session.role)}
        canDecide={canDecideApproval(session.role)}
      />
    ) : (
      <OverviewPanel />
    );

  return (
    <AppShell
      brand="EDIM"
      tenantLabel={`tenant ${session?.tenantId.slice(0, 8) ?? ""}`}
      modules={
        <ModuleMenu modules={session ? modulesForRole(session.role) : []} />
      }
      userSlot={
        <>
          <span style={{ fontSize: "var(--fs-13)", color: "var(--ink-muted)" }}>
            {session?.email}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-12)",
              color: "var(--accent)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
              borderRadius: "var(--radius-sm)",
              padding: "0 6px",
            }}
          >
            {session?.role}
          </span>
          <ThemeToggle />
          <SignOutButton />
        </>
      }
      tree={<HierarchyTree nodes={tree} selected={node ?? null} />}
      inspector={<InspectorSkeleton />}
    >
      {main}
    </AppShell>
  );
}

function toView(
  d: Awaited<ReturnType<typeof getProjectDetailByStable>>,
): ProjectView {
  const { project, tasks, attachments, approvals } = d!;
  return {
    id: project.id,
    projectNo: project.projectNo,
    name: project.name,
    type: project.type,
    clientName: project.clientName,
    clientContact: project.clientContact,
    itemType: project.itemType,
    salesStage: project.salesStage,
    status: project.status,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      state: t.state,
      dueAt: t.dueAt ? t.dueAt.toISOString() : null,
    })),
    attachments: attachments.map((a) => ({
      id: a.id,
      department: a.department,
      docType: a.docType,
      name: a.name,
      description: a.description,
      uploadedAt: a.uploadedAt.toISOString(),
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      state: a.state,
      note: a.note,
      requestedAt: a.requestedAt.toISOString(),
    })),
  };
}

function OverviewPanel() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-20)",
          fontWeight: 500,
          margin: "0 0 8px",
        }}
      >
        overview
      </h1>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 20px" }}>
        Hierarchy rail에서 프로젝트 노드를 선택하면 상세가 여기에 표시됩니다.
        (CPQ / PLM / ERP 워크플로우는 L3)
      </p>
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          padding: 16,
        }}
      >
        <div
          style={{
            fontSize: "var(--fs-13)",
            color: "var(--ink-muted)",
            marginBottom: 8,
          }}
        >
          code chip (§5.5, sample — real RCCS codes injected post-GAP1)
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <CodeChip code="EU-55-2123-A1" />
          <CodeChip code="ER-12-0480" />
        </div>
      </div>
    </div>
  );
}

function InspectorSkeleton() {
  return (
    <div style={{ color: "var(--ink-muted)", fontSize: "var(--fs-13)" }}>
      <div style={{ marginBottom: 6, color: "var(--ink)" }}>data / table</div>
      <p style={{ margin: 0 }}>
        Data Up-Load / Table 자리. 골격만 — 내용은 L3에서.
      </p>
    </div>
  );
}
