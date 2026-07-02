"use client";

import { useState, type CSSProperties } from "react";
import type { HierarchyTreeNode } from "@edim/core-ontology";
import { StableIdBadge } from "@edim/ui";

/**
 * The Hierarchy Tree rail (handoff §5.4): the data-address system, with indent
 * guides (drafting feel), collapse/expand, and a mono stable_id badge per node.
 * Rows are native buttons, so keyboard focus + Enter/Space toggling come free.
 */

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  borderRadius: "var(--radius-sm)",
  padding: "3px 4px",
  cursor: "pointer",
  color: "var(--ink)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--fs-13)",
};

function TreeItem({ node }: { node: HierarchyTreeNode }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <button
        type="button"
        style={row}
        onClick={() => hasChildren && setOpen(!open)}
        aria-expanded={hasChildren ? open : undefined}
      >
        <span
          aria-hidden
          style={{
            width: 12,
            color: "var(--ink-muted)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-12)",
          }}
        >
          {hasChildren ? (open ? "▾" : "▸") : "·"}
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {node.label}
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-12)",
            color: "var(--ink-muted)",
            opacity: 0.75,
          }}
        >
          {node.kind}
        </span>
        <StableIdBadge id={node.stableId} />
      </button>

      {hasChildren && open && (
        <ul
          style={{
            listStyle: "none",
            margin: "0 0 0 10px",
            padding: "0 0 0 12px",
            borderLeft: "1px solid var(--line)",
          }}
        >
          {node.children.map((c) => (
            <TreeItem key={c.stableId} node={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function HierarchyTree({ nodes }: { nodes: HierarchyTreeNode[] }) {
  if (nodes.length === 0) {
    return (
      <p
        style={{
          color: "var(--ink-muted)",
          fontSize: "var(--fs-13)",
          padding: 8,
        }}
      >
        no hierarchy nodes yet
      </p>
    );
  }
  return (
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {nodes.map((n) => (
        <TreeItem key={n.stableId} node={n} />
      ))}
    </ul>
  );
}
