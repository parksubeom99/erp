import Link from "next/link";
import { getServerSession } from "@/app/lib/session";
import { getModule, canAccessModule } from "@/app/lib/modules";
import { listProjectsForSession } from "@/app/lib/project";

/**
 * Module routing stub (STEP 5). Guarded server-side: an unpermitted role sees a
 * forbidden notice, never module content. The 'project' module lists the
 * tenant's projects, each linking into the Main Work Panel detail (?node=).
 */
export default async function ModulePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const session = await getServerSession();
  const mod = getModule(key);
  const allowed = !!session && !!mod && canAccessModule(session.role, key);
  const projects =
    allowed && key === "project" ? await listProjectsForSession() : null;

  return (
    <main style={{ maxWidth: 640, margin: "10vh auto", padding: 24 }}>
      <Link
        href="/"
        style={{ color: "var(--accent)", fontSize: "var(--fs-13)" }}
      >
        ← back to Main Form
      </Link>
      {allowed ? (
        <>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              marginTop: 16,
            }}
          >
            {mod!.label}
          </h1>
          {key === "project" ? (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {(projects ?? []).map((p) => (
                <li
                  key={p.id}
                  style={{
                    padding: "6px 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <Link
                    href={`/?node=${p.hierarchyStable}`}
                    style={{ color: "var(--ink)", textDecoration: "none" }}
                  >
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--accent)",
                      }}
                    >
                      {p.projectNo}
                    </span>{" "}
                    {p.name}
                  </Link>
                </li>
              ))}
              {(projects ?? []).length === 0 && (
                <li style={{ color: "var(--ink-muted)" }}>no projects</li>
              )}
            </ul>
          ) : (
            <p style={{ color: "var(--ink-muted)" }}>
              여기에 {mod!.label} 워크플로우가 들어옵니다. (L3 — 범위 밖)
            </p>
          )}
        </>
      ) : (
        <>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 500,
              marginTop: 16,
              color: "var(--warn)",
            }}
          >
            403 — 접근 권한 없음
          </h1>
          <p style={{ color: "var(--ink-muted)" }}>
            현재 역할({session?.role ?? "?"})로는 이 모듈에 접근할 수 없습니다.
          </p>
        </>
      )}
    </main>
  );
}
