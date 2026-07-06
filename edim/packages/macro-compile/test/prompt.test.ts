import { describe, expect, it } from "vitest";
import type { HierarchyTreeNode } from "@edim/core-ontology";
import { hasErrors, verify } from "@edim/macro-verify";
import { SYSTEM_PROMPT, buildRetryPrompt, buildUserPrompt } from "../src/index";

const tree: HierarchyTreeNode[] = [
  {
    stableId: "a-root",
    parentStable: null,
    kind: "set-up",
    label: "EDIM Set-up",
    position: 0,
    depth: 1,
    children: [
      { stableId: "a-mod", parentStable: "a-root", kind: "module", label: "AHU-01", position: 0, depth: 2, children: [] },
    ],
  },
];
const ctx = { tree, tenantId: "T" };

/** Every DSL the system prompt teaches must itself pass the verifier — no drift. */
const EXAMPLES = [
  "=SUM(Table1(A,1:3))",
  "=Var(NS,15)",
  "=IF(A,A>5, 10, 20)",
  "=ROUND(3.14159, 2)",
  "=AVG(Table1(A,1:3))",
  "=edim://tenant/T/edim-set-up/ahu-01",
];

describe("system prompt — spec integrity", () => {
  it("states the load-bearing rules", () => {
    for (const token of ["'='", "case-sensitive", "IF", "Table", "edim://", "PreC"]) {
      expect(SYSTEM_PROMPT).toContain(token);
    }
  });

  it("every few-shot example verifies clean (no errors)", () => {
    for (const dsl of EXAMPLES) {
      const diagnostics = verify(dsl, ctx);
      expect(hasErrors(diagnostics), `${dsl} → ${JSON.stringify(diagnostics)}`).toBe(false);
    }
  });
});

describe("prompt builders", () => {
  it("the initial prompt carries the request", () => {
    expect(buildUserPrompt("sum the range")).toContain("sum the range");
  });

  it("the retry prompt carries the candidate and error codes", () => {
    const diagnostics = verify("=1+", ctx);
    const retry = buildRetryPrompt("sum the range", "=1+", diagnostics);
    expect(retry).toContain("=1+");
    expect(retry).toContain("PARSE_ERROR");
  });
});
