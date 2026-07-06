import { describe, expect, it } from "vitest";
import type { HierarchyTreeNode } from "@edim/core-ontology";
import { InMemoryProvider } from "@edim/macro-dsl";
import type { DataProvider } from "@edim/macro-dsl";
import { parse } from "@edim/macro-dsl";
import { dryRun, review } from "../src/index";

const provider: DataProvider = new InMemoryProvider({
  tables: { "1!A": { 1: 10, 2: 20, 3: 30 } },
  vars: { "NS|15": 7 },
  codes: { A: 6, B: 7 },
});

const tree: HierarchyTreeNode[] = [
  { stableId: "a-root", parentStable: null, kind: "set-up", label: "EDIM Set-up", position: 0, depth: 1, children: [] },
];
const ctx = { tree, tenantId: "T" };

function parseOk(src: string) {
  const p = parse(src);
  if (!p.ok) throw new Error(`parse failed: ${p.error.message}`);
  return p.value;
}

describe("dryRun — numeric preview matches the executor", () => {
  it("scalar result carries value and Run → N preview", () => {
    const r = dryRun(parseOk("=SUM(Table1(A,1:3))"), provider);
    expect(r.ok).toBe(true);
    expect(r.value).toBe(60);
    expect(r.preview).toBe("Run → 60");
  });
  it("range result previews as an array", () => {
    const r = dryRun(parseOk("=Table1(A,1:3)"), provider);
    expect(r.value).toEqual([10, 20, 30]);
    expect(r.preview).toBe("Run → [10, 20, 30]");
  });
  it("composed arithmetic matches", () => {
    const r = dryRun(parseOk("=SUM(Table1(A,1:3))+Var(NS,15)"), provider);
    expect(r.value).toBe(67);
  });
});

describe("dryRun — closed-world outcomes", () => {
  it("reserved token → warning, no value", () => {
    const r = dryRun(parseOk("=PreC(1)"), provider);
    expect(r.ok).toBe(false);
    expect(r.value).toBeUndefined();
    expect(r.diagnostic?.severity).toBe("warning");
    expect(r.diagnostic?.code).toBe("RESERVED_FN");
  });
  it("unknown symbol → error", () => {
    const r = dryRun(parseOk("=Var(NS,99)"), provider);
    expect(r.ok).toBe(false);
    expect(r.diagnostic?.severity).toBe("error");
    expect(r.diagnostic?.code).toBe("UNKNOWN_SYMBOL");
  });
});

describe("review — static gate then preview", () => {
  it("a static error blocks the dry-run", () => {
    const r = review("=Table1(A,1:3)+1", ctx, provider);
    expect(r.dryRun).toBeNull();
    expect(r.diagnostics.some((d) => d.code === "TYPE_ERROR")).toBe(true);
  });
  it("a clean macro runs the dry-run", () => {
    const r = review("=SUM(Table1(A,1:3))", ctx, provider);
    expect(r.diagnostics).toEqual([]);
    expect(r.dryRun?.ok).toBe(true);
    expect(r.dryRun?.value).toBe(60);
  });
  it("a reserved warning does not block the dry-run attempt", () => {
    const r = review("=PreC(1)", ctx, provider);
    expect(r.diagnostics.some((d) => d.severity === "warning")).toBe(true);
    expect(r.dryRun).not.toBeNull();
    expect(r.dryRun?.diagnostic?.code).toBe("RESERVED_FN");
  });
});
