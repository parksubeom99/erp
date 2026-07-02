import { AppShell, ThemeToggle, CodeChip } from "@edim/ui";
import { getServerSession } from "@/app/lib/session";
import { getTreeForSession } from "@/app/lib/hierarchy";
import { modulesForRole } from "@/app/lib/modules";
import { ModuleMenu } from "./module-menu";
import { HierarchyTree } from "./hierarchy-tree";
import { SignOutButton } from "./sign-out-button";

/**
 * STEP 4 — the Main Form shell. Left rail shows the live Hierarchy tree (real
 * data via RLS), center is the Overview tab with an L3 placeholder, right is the
 * Inspector skeleton. Top bar carries the (full) module menu — RBAC gating is
 * STEP 5. Main Work Panel content stays a placeholder per the L1-before-L3 rule.
 */
export default async function Home() {
  const session = await getServerSession();
  const tree = (await getTreeForSession()) ?? [];

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
      tree={<HierarchyTree nodes={tree} />}
      inspector={<InspectorSkeleton />}
    >
      <OverviewPanel />
    </AppShell>
  );
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
        여기에 CPQ / PLM / ERP 워크플로우가 들어옵니다. (L3 — 범위 밖)
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
          code chip (§5.5, sample — real RCCS codes injected in L3)
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
