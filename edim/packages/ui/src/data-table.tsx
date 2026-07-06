import type { ReactNode } from "react";

/**
 * Dense, aligned data table (handoff §4 — "밀도 높은 정렬표, mono 데이터 셀").
 * Presentational + reusable across modules. Values are pre-formatted by the
 * caller; `mono` marks a column as monospace (numbers, ids, codes).
 */
export interface Column<Row> {
  key: keyof Row & string;
  label: string;
  mono?: boolean;
}

export function DataTable<Row extends Record<string, ReactNode>>({
  columns,
  rows,
  empty = "no rows",
}: {
  columns: Column<Row>[];
  rows: Row[];
  empty?: string;
}) {
  if (rows.length === 0) {
    return (
      <p
        style={{
          color: "var(--ink-muted)",
          fontSize: "var(--fs-13)",
          padding: 8,
        }}
      >
        {empty}
      </p>
    );
  }
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: "var(--fs-13)",
      }}
    >
      <thead>
        <tr>
          {columns.map((c) => (
            <th
              key={c.key}
              style={{
                textAlign: "left",
                fontWeight: 500,
                color: "var(--ink-muted)",
                borderBottom: "1px solid var(--line)",
                padding: "6px 10px",
                whiteSpace: "nowrap",
              }}
            >
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td
                key={c.key}
                style={{
                  borderBottom: "1px solid var(--line)",
                  padding: "6px 10px",
                  color: "var(--ink)",
                  fontFamily: c.mono ? "var(--font-mono)" : "inherit",
                  verticalAlign: "top",
                }}
              >
                {r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
