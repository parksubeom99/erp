"use client";

import { useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { SALES_STAGES } from "@edim/core-ontology";
import { DataTable } from "@edim/ui";

export interface ProjectView {
  id: string;
  projectNo: string;
  name: string;
  type: string;
  clientName: string | null;
  clientContact: string | null;
  itemType: string | null;
  salesStage: string;
  status: string;
  tasks: { id: string; title: string; state: string; dueAt: string | null }[];
  attachments: {
    id: string;
    department: string;
    docType: string;
    name: string;
    description: string | null;
    uploadedAt: string;
  }[];
  approvals: {
    id: string;
    state: string;
    note: string | null;
    requestedAt: string;
  }[];
}

type Tab = "overview" | "files" | "schedule" | "approval";

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export function ProjectDetail({
  p,
  canEdit,
  canDecide,
}: {
  p: ProjectView;
  canEdit: boolean;
  canDecide: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("overview");
  const [taskTitle, setTaskTitle] = useState("");
  const refresh = () => router.refresh();

  const currentStageIdx = SALES_STAGES.indexOf(p.salesStage as never);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-16)",
            color: "var(--accent)",
          }}
        >
          {p.projectNo}
        </span>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-20)",
            fontWeight: 500,
            margin: 0,
          }}
        >
          {p.name}
        </h1>
        {p.clientName && (
          <span style={{ color: "var(--ink-muted)" }}>· {p.clientName}</span>
        )}
        {p.status === "closed" && (
          <span style={{ color: "var(--warn)", fontSize: "var(--fs-12)" }}>
            closed
          </span>
        )}
      </div>

      {/* Sales-stage stepper */}
      <div
        style={{ display: "flex", gap: 4, flexWrap: "wrap", margin: "16px 0" }}
      >
        {SALES_STAGES.map((s, i) => {
          const active = s === p.salesStage;
          const passed = currentStageIdx >= 0 && i < currentStageIdx;
          return (
            <button
              key={s}
              type="button"
              disabled={!canEdit}
              onClick={async () => {
                if (
                  canEdit &&
                  (await post(`/api/projects/${p.id}/stage`, { stage: s }))
                )
                  refresh();
              }}
              style={{
                fontSize: "var(--fs-13)",
                fontFamily: "var(--font-body)",
                padding: "4px 10px",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${active ? "var(--accent)" : "var(--line)"}`,
                background: active ? "var(--accent)" : "transparent",
                color: active
                  ? "var(--accent-contrast)"
                  : passed
                    ? "var(--ink)"
                    : "var(--ink-muted)",
                cursor: canEdit ? "pointer" : "default",
              }}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          borderBottom: "1px solid var(--line)",
        }}
      >
        {(
          [
            ["overview", "개요"],
            ["files", "자료"],
            ["schedule", "일정"],
            ["approval", "승인"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            style={{
              fontSize: "var(--fs-13)",
              padding: "8px 12px",
              background: "transparent",
              border: "none",
              borderBottom: `2px solid ${tab === t ? "var(--accent)" : "transparent"}`,
              color: tab === t ? "var(--ink)" : "var(--ink-muted)",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ paddingTop: 16 }}>
        {tab === "overview" && (
          <dl
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: "6px 12px",
              margin: 0,
              fontSize: "var(--fs-13)",
            }}
          >
            <Field k="type" v={p.type} />
            <Field k="item type" v={p.itemType ?? "—"} />
            <Field k="client" v={p.clientName ?? "—"} />
            <Field k="contact" v={p.clientContact ?? "—"} />
            <Field k="stage" v={p.salesStage} />
            <Field k="status" v={p.status} />
          </dl>
        )}

        {tab === "files" && (
          <DataTable
            columns={[
              { key: "department", label: "department" },
              { key: "docType", label: "doc type" },
              { key: "name", label: "name" },
              { key: "description", label: "description" },
              { key: "uploadedAt", label: "uploaded", mono: true },
            ]}
            rows={p.attachments.map((a) => ({
              department: a.department,
              docType: a.docType,
              name: a.name,
              description: a.description ?? "—",
              uploadedAt: a.uploadedAt.slice(0, 10),
            }))}
            empty="no attachments"
          />
        )}

        {tab === "schedule" && (
          <div>
            {canEdit && (
              <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="new task"
                  style={{ flex: 1, padding: 6, fontSize: "var(--fs-13)" }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      taskTitle.trim() &&
                      (await post(`/api/projects/${p.id}/tasks`, {
                        title: taskTitle,
                      }))
                    ) {
                      setTaskTitle("");
                      refresh();
                    }
                  }}
                  style={{ padding: "6px 12px", fontSize: "var(--fs-13)" }}
                >
                  add
                </button>
              </div>
            )}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {p.tasks.length === 0 && (
                <li
                  style={{
                    color: "var(--ink-muted)",
                    fontSize: "var(--fs-13)",
                  }}
                >
                  no tasks
                </li>
              )}
              {p.tasks.map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 0",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={t.state === "done"}
                    disabled={!canEdit}
                    onChange={async () => {
                      const next = t.state === "done" ? "todo" : "done";
                      if (
                        await post(`/api/project-tasks/${t.id}`, {
                          state: next,
                        })
                      )
                        refresh();
                    }}
                  />
                  <span
                    style={{
                      textDecoration:
                        t.state === "done" ? "line-through" : "none",
                      color:
                        t.state === "done" ? "var(--ink-muted)" : "var(--ink)",
                    }}
                  >
                    {t.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tab === "approval" && (
          <div>
            {canEdit && (
              <button
                type="button"
                onClick={async () => {
                  if (
                    await post(`/api/projects/${p.id}/approvals`, {
                      note: null,
                    })
                  )
                    refresh();
                }}
                style={{
                  padding: "6px 12px",
                  fontSize: "var(--fs-13)",
                  marginBottom: 12,
                }}
              >
                request approval
              </button>
            )}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {p.approvals.length === 0 && (
                <li
                  style={{
                    color: "var(--ink-muted)",
                    fontSize: "var(--fs-13)",
                  }}
                >
                  no approvals
                </li>
              )}
              {p.approvals.map((a) => (
                <li
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "var(--fs-12)",
                      color: "var(--ink-muted)",
                    }}
                  >
                    {a.requestedAt.slice(0, 10)}
                  </span>
                  <StateBadge state={a.state} />
                  <span style={{ flex: 1 }} />
                  {canDecide && a.state === "requested" && (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            await post(`/api/project-approvals/${a.id}`, {
                              decision: "approved",
                            })
                          )
                            refresh();
                        }}
                        style={{ fontSize: "var(--fs-12)", padding: "2px 8px" }}
                      >
                        approve
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            await post(`/api/project-approvals/${a.id}`, {
                              decision: "rejected",
                            })
                          )
                            refresh();
                        }}
                        style={{ fontSize: "var(--fs-12)", padding: "2px 8px" }}
                      >
                        reject
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt style={{ color: "var(--ink-muted)" }}>{k}</dt>
      <dd style={{ margin: 0 }}>{v}</dd>
    </>
  );
}

function StateBadge({ state }: { state: string }) {
  const color =
    state === "approved"
      ? "var(--accent)"
      : state === "rejected"
        ? "var(--warn)"
        : "var(--info)";
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-12)",
        color,
        border: `1px solid ${color}`,
        borderRadius: "var(--radius-sm)",
        padding: "0 6px",
      }}
    >
      {state}
    </span>
  );
}
