import { describe, expect, it } from "vitest";
import type { HierarchyTreeNode } from "@edim/core-ontology";
import { parse } from "@edim/macro-dsl";
import { checkCycles, hasErrors, verify } from "../src/index";
import type { Diagnostic } from "../src/index";

/** Fixture mirroring the seed tree (tenant T): Set-up → AHU-01 → Cooling Coil. */
const tree: HierarchyTreeNode[] = [
  {
    stableId: "a-root",
    parentStable: null,
    kind: "set-up",
    label: "EDIM Set-up",
    position: 0,
    depth: 1,
    children: [
      {
        stableId: "a-mod",
        parentStable: "a-root",
        kind: "module",
        label: "AHU-01",
        position: 0,
        depth: 2,
        children: [
          {
            stableId: "a-item",
            parentStable: "a-mod",
            kind: "item",
            label: "Cooling Coil",
            position: 0,
            depth: 3,
            children: [],
          },
        ],
      },
    ],
  },
];

const ctx = { tree, tenantId: "T" };

/** Assert exactly one diagnostic and return it. */
function one(diags: readonly Diagnostic[]): Diagnostic {
  expect(diags).toHaveLength(1);
  return diags[0]!;
}

describe("verify — clean pass", () => {
  it("a well-formed numeric macro yields no diagnostics", () => {
    expect(verify("=SUM(Table1(A,1:3))+Var(NS,15)", ctx)).toEqual([]);
  });
  it("a resolvable address yields no diagnostics", () => {
    expect(verify("=edim://tenant/T/edim-set-up/ahu-01/cooling-coil", ctx)).toEqual([]);
  });
});

describe("verify — ① parse", () => {
  it("malformed source → PARSE_ERROR error", () => {
    const d = one(verify("=1+", ctx));
    expect(d.severity).toBe("error");
    expect(d.code).toBe("PARSE_ERROR");
  });
});

describe("verify — ② address existence", () => {
  it("unknown segment → ADDRESS_UNKNOWN error", () => {
    const d = one(verify("=edim://tenant/T/edim-set-up/nope", ctx));
    expect(d.severity).toBe("error");
    expect(d.code).toBe("ADDRESS_UNKNOWN");
  });
  it("cross-tenant URI → ADDRESS_UNKNOWN error", () => {
    const d = one(verify("=edim://tenant/OTHER/edim-set-up", ctx));
    expect(d.code).toBe("ADDRESS_UNKNOWN");
    expect(d.message).toContain("CROSS_TENANT");
  });
});

describe("verify — ③ type / unit", () => {
  it("range in arithmetic → TYPE_ERROR error", () => {
    const d = one(verify("=Table1(A,1:3)+1", ctx));
    expect(d.severity).toBe("error");
    expect(d.code).toBe("TYPE_ERROR");
  });
  it("literal division by zero → TYPE_ERROR error", () => {
    const d = one(verify("=10/0", ctx));
    expect(d.code).toBe("TYPE_ERROR");
    expect(d.message).toContain("division by zero");
  });
});

describe("verify — reserved tokens surface as warnings, not errors", () => {
  it("PreC → RESERVED_FN warning (approval gate stays open)", () => {
    const d = one(verify("=PreC(1)", ctx));
    expect(d.severity).toBe("warning");
    expect(d.code).toBe("RESERVED_FN");
    expect(hasErrors([d])).toBe(false);
  });
  it("Table 3rd arg (Cos2) → RESERVED_ARG warning", () => {
    const d = one(verify("=Table1(A,1:3,Cos2)", ctx));
    expect(d.severity).toBe("warning");
    expect(d.code).toBe("RESERVED_ARG");
  });
  it("Var FES namespace → RESERVED_ARG warning", () => {
    const d = one(verify("=Var(FES,15,F3)", ctx));
    expect(d.severity).toBe("warning");
    expect(d.code).toBe("RESERVED_ARG");
  });
});

describe("verify — ④ cycle detection seam (deferred in v1.0)", () => {
  it("checkCycles returns no diagnostics and never throws", () => {
    const parsed = parse("=SUM(Table1(A,1:3))");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(checkCycles(parsed.value)).toEqual([]);
  });
});
