import { describe, expect, it } from "vitest";
import type { HierarchyTreeNode } from "@edim/core-ontology";
import { parseUri, resolveUri, slug, toUri } from "../src/index";

/** Fixture mirroring the seed tree (tenant A): Set-up → AHU-01 → Cooling Coil. */
const treeA: HierarchyTreeNode[] = [
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

function unwrap<T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`);
  return r.value;
}

describe("slug", () => {
  it("normalizes spaces, case, hyphens", () => {
    expect(slug("EDIM Set-up")).toBe("edim-set-up");
    expect(slug("AHU-01")).toBe("ahu-01");
    expect(slug("Cooling Coil")).toBe("cooling-coil");
  });
  it("is idempotent", () => {
    expect(slug(slug("EDIM Set-up"))).toBe("edim-set-up");
  });
});

describe("parseUri", () => {
  it("parses tenant + segments", () => {
    expect(unwrap(parseUri("edim://tenant/T/ahu-01/cooling-coil"))).toEqual({
      tenantId: "T",
      segments: ["ahu-01", "cooling-coil"],
    });
  });
  it("rejects wrong scheme", () => {
    const r = parseUri("http://tenant/T/x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ADDRESS_PARSE_ERROR");
  });
  it("rejects missing tenant", () => {
    const r = parseUri("edim://tenant/");
    expect(r.ok).toBe(false);
  });
  it("rejects empty segment", () => {
    const r = parseUri("edim://tenant/T//x");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("ADDRESS_PARSE_ERROR");
  });
});

describe("resolveUri", () => {
  it("resolves a full path to the leaf StableId", () => {
    expect(unwrap(resolveUri(treeA, "edim://tenant/T/edim-set-up/ahu-01/cooling-coil", { tenantId: "T" }))).toBe(
      "a-item",
    );
  });
  it("resolves a partial path to an intermediate node", () => {
    expect(unwrap(resolveUri(treeA, "edim://tenant/T/edim-set-up", { tenantId: "T" }))).toBe("a-root");
  });
  it("is case/format-insensitive via slug", () => {
    expect(unwrap(resolveUri(treeA, "edim://tenant/T/edim-set-up/AHU-01", { tenantId: "T" }))).toBe("a-mod");
  });
  it("unknown segment → UNKNOWN_ADDRESS", () => {
    const r = resolveUri(treeA, "edim://tenant/T/edim-set-up/nope", { tenantId: "T" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN_ADDRESS");
  });
  it("wrong tenant → CROSS_TENANT", () => {
    const r = resolveUri(treeA, "edim://tenant/OTHER/edim-set-up", { tenantId: "T" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("CROSS_TENANT");
  });
});

describe("ambiguity — no silent first-wins", () => {
  const amb: HierarchyTreeNode[] = [
    { stableId: "r", parentStable: null, kind: "set-up", label: "Root", position: 0, depth: 1, children: [
      { stableId: "x1", parentStable: "r", kind: "module", label: "Fan", position: 0, depth: 2, children: [] },
      { stableId: "x2", parentStable: "r", kind: "module", label: "fan", position: 1, depth: 2, children: [] },
    ] },
  ];
  it("two siblings sharing a slug → AMBIGUOUS_ADDRESS", () => {
    const r = resolveUri(amb, "edim://tenant/T/root/fan", { tenantId: "T" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("AMBIGUOUS_ADDRESS");
  });
});

describe("toUri + round-trip", () => {
  it("builds the canonical URI", () => {
    expect(unwrap(toUri(treeA, "a-item", "T"))).toBe("edim://tenant/T/edim-set-up/ahu-01/cooling-coil");
  });
  it("unknown node → UNKNOWN_ADDRESS", () => {
    const r = toUri(treeA, "ghost", "T");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN_ADDRESS");
  });
  it("round-trips every node: resolveUri(toUri(x)) === x", () => {
    for (const id of ["a-root", "a-mod", "a-item"]) {
      const uri = unwrap(toUri(treeA, id, "T"));
      expect(unwrap(resolveUri(treeA, uri, { tenantId: "T" }))).toBe(id);
    }
  });
});

describe("prefix (plm-style namespace) — v1.0 strip/verify", () => {
  it("consumes a leading prefix segment before matching", () => {
    expect(
      unwrap(resolveUri(treeA, "edim://tenant/T/plm/edim-set-up/ahu-01", { tenantId: "T", prefix: ["plm"] })),
    ).toBe("a-mod");
  });
  it("round-trips with a prefix", () => {
    const uri = unwrap(toUri(treeA, "a-item", "T", ["plm"]));
    expect(uri).toBe("edim://tenant/T/plm/edim-set-up/ahu-01/cooling-coil");
    expect(unwrap(resolveUri(treeA, uri, { tenantId: "T", prefix: ["plm"] }))).toBe("a-item");
  });
  it("prefix mismatch → UNKNOWN_ADDRESS", () => {
    const r = resolveUri(treeA, "edim://tenant/T/edim-set-up", { tenantId: "T", prefix: ["plm"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("UNKNOWN_ADDRESS");
  });
});
