/**
 * @edim/ui — design system: tokens + shell components.
 *
 * Dependency rule: ui → core-ontology only (domain types). No db/auth.
 * Global tokens live in ./tokens.css (import "@edim/ui/tokens.css").
 */
export const UI_PACKAGE = "@edim/ui" as const;

export { AppShell, type AppShellProps } from "./app-shell";
export { CodeChip, StableIdBadge } from "./code-chip";
export { ThemeToggle, themeInitScript } from "./theme-toggle";
export { DataTable, type Column } from "./data-table";
