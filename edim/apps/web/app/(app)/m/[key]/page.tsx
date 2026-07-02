import Link from "next/link";
import { getServerSession } from "@/app/lib/session";
import { getModule, canAccessModule } from "@/app/lib/modules";

/**
 * Module routing stub (STEP 5). Content is a placeholder — real workflows are L3.
 * Guarded server-side: an unpermitted role sees a forbidden notice, never the
 * module content (the /api/modules/[key] route returns the 403 status the test
 * asserts).
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
          <p style={{ color: "var(--ink-muted)" }}>
            여기에 {mod!.label} 워크플로우가 들어옵니다. (L3 — 범위 밖)
          </p>
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
