import { describe, expect, it } from "vitest";
import type { HierarchyTreeNode } from "@edim/core-ontology";
import { ScriptedLLMClient, compile } from "../src/index";
import type { LLMClient, LLMRequest, LLMResult } from "../src/index";

/** Tenant T: EDIM Set-up → AHU-01 → Cooling Coil (mirrors the seed tree). */
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
        children: [],
      },
    ],
  },
];

const ctx = { tree, tenantId: "T" };

describe("compile — happy path", () => {
  it("one valid candidate → verified in a single attempt", async () => {
    const client = new ScriptedLLMClient(["=SUM(Table1(A,1:3))"]);
    const r = await compile("sum column A rows 1..3 of table 1", ctx, client);
    expect(r.verified).toBe(true);
    expect(r.dsl).toBe("=SUM(Table1(A,1:3))");
    expect(r.attempts).toBe(1);
    expect(r.diagnostics).toEqual([]);
  });

  it("trims surrounding whitespace from the model output", async () => {
    const client = new ScriptedLLMClient(["  =Var(NS,15)\n"]);
    const r = await compile("variable 15 in NS", ctx, client);
    expect(r.verified).toBe(true);
    expect(r.dsl).toBe("=Var(NS,15)");
  });
});

describe("compile — feedback retry loop", () => {
  it("parse error → feedback → success on the second attempt", async () => {
    const client = new ScriptedLLMClient(["=1+", "=SUM(Table1(A,1:3))"]);
    const r = await compile("sum of the range", ctx, client);
    expect(r.verified).toBe(true);
    expect(r.attempts).toBe(2);
  });

  it("type error → feedback → success", async () => {
    const client = new ScriptedLLMClient(["=Table1(A,1:3)+1", "=SUM(Table1(A,1:3))"]);
    const r = await compile("add the range to one", ctx, client);
    expect(r.verified).toBe(true);
    expect(r.attempts).toBe(2);
  });

  it("unknown address → feedback → success", async () => {
    const client = new ScriptedLLMClient([
      "=edim://tenant/T/edim-set-up/nope",
      "=edim://tenant/T/edim-set-up/ahu-01",
    ]);
    const r = await compile("value at ahu-01", ctx, client);
    expect(r.verified).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.dsl).toBe("=edim://tenant/T/edim-set-up/ahu-01");
  });

  it("the retry prompt carries the previous candidate and its errors", async () => {
    const seen: LLMRequest[] = [];
    const spy: LLMClient = {
      async complete(req: LLMRequest): Promise<LLMResult> {
        seen.push(req);
        return { ok: true, text: seen.length === 1 ? "=1+" : "=SUM(Table1(A,1:3))" };
      },
    };
    const r = await compile("sum please", ctx, spy);
    expect(r.verified).toBe(true);
    expect(seen).toHaveLength(2);
    expect(seen[1]!.user).toContain("=1+");
    expect(seen[1]!.user).toContain("PARSE_ERROR");
  });
});

describe("compile — transparent give-up (owner decision A)", () => {
  it("exhausts retries → verified:false with the last candidate and diagnostics", async () => {
    const client = new ScriptedLLMClient(["=Table1(A,1:3)+1"]); // always the same bad answer
    const r = await compile("bad forever", ctx, client, { maxRetries: 2 });
    expect(r.verified).toBe(false);
    expect(r.attempts).toBe(3); // 1 initial + 2 retries
    expect(r.dsl).toBe("=Table1(A,1:3)+1");
    expect(r.diagnostics.some((d) => d.severity === "error")).toBe(true);
  });
});

describe("compile — reserved warnings do not block", () => {
  it("a reserved token verifies (warning, not error)", async () => {
    const client = new ScriptedLLMClient(["=PreC(1)"]);
    const r = await compile("precede one", ctx, client);
    expect(r.verified).toBe(true);
    expect(r.attempts).toBe(1);
    expect(r.diagnostics.some((d) => d.severity === "warning")).toBe(true);
  });
});

describe("compile — transport failure", () => {
  it("a client error stops the loop and reports llmError", async () => {
    const client = new ScriptedLLMClient([]); // empty → transport failure
    const r = await compile("anything", ctx, client);
    expect(r.verified).toBe(false);
    expect(r.attempts).toBe(1);
    expect(r.llmError).toBeDefined();
  });
});
