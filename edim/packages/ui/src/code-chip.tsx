import type { CSSProperties } from "react";

/**
 * "code chip" (handoff §5.5) — renders an RCCS code in mono with segment
 * separators subtly de-emphasized, so `EU-55-2123` reads as structured code.
 * Real code data is injected in L3; this is the presentational component.
 */
export function CodeChip({ code }: { code: string }) {
  const segments = code.split("-");
  const wrap: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 0,
    fontFamily: "var(--font-mono)",
    fontSize: "var(--fs-12)",
    color: "var(--accent)",
    background: "color-mix(in srgb, var(--accent) 8%, transparent)",
    border: "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
    borderRadius: "var(--radius-sm)",
    padding: "1px 6px",
    lineHeight: 1.6,
  };
  const sep: CSSProperties = {
    color: "var(--ink-muted)",
    opacity: 0.5,
    margin: "0 1px",
  };
  return (
    <span style={wrap} title={code}>
      {segments.map((s, i) => (
        <span key={i}>
          {i > 0 && <span style={sep}>-</span>}
          {s}
        </span>
      ))}
    </span>
  );
}

/**
 * stable_id badge — the mono identity chip shown on hierarchy nodes and data
 * cells. Shows a short prefix; full id on hover.
 */
export function StableIdBadge({ id }: { id: string }) {
  return (
    <code
      title={id}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-12)",
        color: "var(--ink-muted)",
        background: "var(--surface-1)",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-sm)",
        padding: "0 4px",
      }}
    >
      {id.slice(0, 8)}
    </code>
  );
}
