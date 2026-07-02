import Link from "next/link";
import type { ModuleDef } from "@/app/lib/modules";

/**
 * Top-bar module menu. Receives the role-filtered subset (STEP 5): unpermitted
 * modules are omitted entirely — never rendered-and-disabled. Each item links to
 * its routing stub, which is *also* guarded server-side.
 */
export function ModuleMenu({ modules }: { modules: ModuleDef[] }) {
  return (
    <ul
      style={{
        display: "flex",
        gap: 2,
        listStyle: "none",
        margin: 0,
        padding: 0,
        overflow: "hidden",
      }}
    >
      {modules.map((m) => (
        <li key={m.key}>
          <Link
            href={`/m/${m.key}`}
            style={{
              display: "inline-block",
              fontFamily: "var(--font-body)",
              fontSize: "var(--fs-13)",
              color: "var(--ink-muted)",
              textDecoration: "none",
              border: "1px solid transparent",
              borderRadius: "var(--radius-sm)",
              padding: "4px 8px",
              whiteSpace: "nowrap",
            }}
          >
            {m.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
