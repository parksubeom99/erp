import { CodeChip, StableIdBadge, ThemeToggle } from "@edim/ui";

/**
 * Design-system demo (handoff §5). A single showcase page: palette, type scale,
 * the code chip, the stable_id badge, and the dark-mode toggle. Not auth-gated
 * so it can be shared as a reference.
 */
const SWATCHES = [
  ["surface-0", "--surface-0"],
  ["surface-1", "--surface-1"],
  ["surface-2", "--surface-2"],
  ["ink", "--ink"],
  ["ink-muted", "--ink-muted"],
  ["line", "--line"],
  ["accent", "--accent"],
  ["info", "--info"],
  ["warn", "--warn"],
] as const;

const SCALE = [12, 13, 14, 16, 20, 28] as const;

export default function DesignPage() {
  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: 32 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 500,
            margin: 0,
          }}
        >
          edim design system
        </h1>
        <ThemeToggle />
      </div>
      <p style={{ color: "var(--ink-muted)" }}>
        drafting precision + code-editor clarity. one teal signature accent.
      </p>

      <section style={{ marginTop: 24 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-16)",
            fontWeight: 500,
          }}
        >
          palette
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {SWATCHES.map(([name, v]) => (
            <div key={name} style={{ width: 120 }}>
              <div
                style={{
                  height: 48,
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--line)",
                  background: `var(${v})`,
                }}
              />
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-12)",
                  color: "var(--ink-muted)",
                  marginTop: 4,
                }}
              >
                {name}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-16)",
            fontWeight: 500,
          }}
        >
          type scale
        </h2>
        {SCALE.map((s) => (
          <div key={s} style={{ fontSize: s, lineHeight: 1.3 }}>
            {s}px — 공조기 파라메트릭 CTO the quick brown fox
          </div>
        ))}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-16)",
            fontWeight: 500,
          }}
        >
          signature elements
        </h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <CodeChip code="EU-55-2123-A1" />
          <CodeChip code="ER-12-0480" />
          <StableIdBadge id="a0000000-0000-4000-8000-000000000001" />
        </div>
      </section>
    </main>
  );
}
