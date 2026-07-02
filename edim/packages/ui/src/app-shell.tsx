"use client";

import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * The Main Form's face (handoff §5.4): Top bar / Hierarchy rail / Main Work
 * Panel / Inspector. Rail and Inspector are collapsible. Purely presentational —
 * data is injected via slots so this stays in the design layer.
 */
export interface AppShellProps {
  brand: string;
  tenantLabel: string;
  modules: ReactNode; // module menu (top bar center)
  userSlot: ReactNode; // theme toggle + user/role + sign out (top bar right)
  tree: ReactNode; // Hierarchy rail body
  inspector: ReactNode; // Inspector body
  children: ReactNode; // Main Work Panel content
}

const railBtn: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--fs-12)",
  color: "var(--ink-muted)",
  background: "transparent",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  padding: "2px 6px",
  cursor: "pointer",
};

const panelHeader: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: "var(--topbar-h)",
  padding: "0 12px",
  borderBottom: "1px solid var(--line)",
  fontFamily: "var(--font-display)",
  fontSize: "var(--fs-13)",
  color: "var(--ink-muted)",
};

export function AppShell({
  brand,
  tenantLabel,
  modules,
  userSlot,
  tree,
  inspector,
  children,
}: AppShellProps) {
  const [railOpen, setRailOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      {/* Top bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          height: "var(--topbar-h)",
          padding: "0 12px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface-1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-16)",
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            {brand}
          </span>
          <span style={{ fontSize: "var(--fs-12)", color: "var(--ink-muted)" }}>
            {tenantLabel}
          </span>
        </div>
        <nav style={{ display: "flex", gap: 4, flex: 1, overflow: "hidden" }}>
          {modules}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {userSlot}
        </div>
      </header>

      {/* Body: rail | main | inspector */}
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Hierarchy rail */}
        {railOpen ? (
          <aside
            style={{
              width: "var(--rail-w)",
              flex: "0 0 var(--rail-w)",
              display: "flex",
              flexDirection: "column",
              borderRight: "1px solid var(--line)",
              background: "var(--surface-1)",
            }}
          >
            <div style={panelHeader}>
              <span>hierarchy</span>
              <button
                type="button"
                style={railBtn}
                aria-label="collapse hierarchy"
                onClick={() => setRailOpen(false)}
              >
                ‹
              </button>
            </div>
            <div style={{ overflow: "auto", padding: "8px 6px", flex: 1 }}>
              {tree}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            style={{
              ...railBtn,
              borderRadius: 0,
              borderRight: "1px solid var(--line)",
              width: 28,
            }}
            aria-label="expand hierarchy"
            onClick={() => setRailOpen(true)}
          >
            ›
          </button>
        )}

        {/* Main Work Panel */}
        <main
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            background: "var(--surface-0)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 2,
              height: "var(--topbar-h)",
              alignItems: "flex-end",
              padding: "0 12px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <span
              style={{
                fontSize: "var(--fs-13)",
                color: "var(--ink)",
                borderBottom: "2px solid var(--accent)",
                padding: "8px 10px",
              }}
            >
              overview
            </span>
          </div>
          <div style={{ overflow: "auto", padding: 20, flex: 1 }}>
            {children}
          </div>
        </main>

        {/* Inspector */}
        {inspectorOpen ? (
          <aside
            style={{
              width: "var(--inspector-w)",
              flex: "0 0 var(--inspector-w)",
              display: "flex",
              flexDirection: "column",
              borderLeft: "1px solid var(--line)",
              background: "var(--surface-1)",
            }}
          >
            <div style={panelHeader}>
              <span>inspector</span>
              <button
                type="button"
                style={railBtn}
                aria-label="collapse inspector"
                onClick={() => setInspectorOpen(false)}
              >
                ›
              </button>
            </div>
            <div style={{ overflow: "auto", padding: 12, flex: 1 }}>
              {inspector}
            </div>
          </aside>
        ) : (
          <button
            type="button"
            style={{
              ...railBtn,
              borderRadius: 0,
              borderLeft: "1px solid var(--line)",
              width: 28,
            }}
            aria-label="expand inspector"
            onClick={() => setInspectorOpen(true)}
          >
            ‹
          </button>
        )}
      </div>
    </div>
  );
}
