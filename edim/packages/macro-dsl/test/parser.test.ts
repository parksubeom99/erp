import { describe, expect, it } from "vitest";
import { parse } from "../src/index";

/** The blueprint's canonical standard formula (STEP 0 §0 corpus anchor). */
const GOLDEN =
  "=IF(MC,CC>500, Table12(E,10:25,Cos2)+Var(FES,15,F3), Table12(E,10:25,Cos2)+Var(FES,15,F3))*PreC(1)";

describe("golden case — blueprint standard formula", () => {
  it("parses successfully", () => {
    const r = parse(GOLDEN);
    expect(r.ok).toBe(true);
  });

  it("produces a stable AST snapshot", () => {
    const r = parse(GOLDEN);
    if (!r.ok) throw new Error("golden formula failed to parse");
    expect(r.value).toMatchSnapshot();
  });
});

describe("parse — each function form", () => {
  const cases: Array<[string, string]> = [
    ["IF", "=IF(A,B>5, 10, 20)"],
    ["Table", "=Table1(A,1:3)"],
    ["Table+aux", "=Table1(A,1:3,Cos2)"],
    ["Var", "=Var(NS,15,F3)"],
    ["PreC", "=PreC(1)"],
    ["SUM", "=SUM(Table1(A,1:3))"],
    ["MIN", "=MIN(Table1(A,1:3))"],
    ["MAX", "=MAX(Table1(A,1:3))"],
    ["AVG", "=AVG(Table1(A,1:3))"],
    ["LOOKUP", "=LOOKUP(20, Table1(A,1:3), B)"],
    ["ROUND", "=ROUND(3.14159, 2)"],
    ["AND", "=AND(A>5, B>5)"],
    ["OR", "=OR(A>5, B>5)"],
    ["uri address", "=edim://tenant/t1/plm/casing/double"],
  ];
  for (const [name, src] of cases) {
    it(`parses ${name}`, () => {
      const r = parse(src);
      expect(r.ok).toBe(true);
    });
  }
});

describe("parse — Run directive", () => {
  it("Run <number>", () => {
    const r = parse("=5 Run 786");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.run).toEqual({
      type: "Run",
      target: { kind: "number", value: 786 },
      position: expect.any(Object),
    });
  });

  it("Run Item", () => {
    const r = parse("=5 Run Item");
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.run?.target).toEqual({ kind: "item", ref: "Item" });
  });
});

describe("parse — failure cases carry a position", () => {
  it("paren mismatch → PARSE_ERROR", () => {
    const r = parse("=IF(A,B>5,10,20");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("PARSE_ERROR");
    expect(r.error.position).toBeDefined();
  });

  it("bad row range → PARSE_ERROR", () => {
    const r = parse("=Table1(A,10)");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("PARSE_ERROR");
  });

  it("bare identifier is not a term → PARSE_ERROR", () => {
    const r = parse("=ABC");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.code).toBe("PARSE_ERROR");
  });

  it("missing leading '=' → PARSE_ERROR", () => {
    const r = parse("IF(A,B>5,1,2)");
    expect(r.ok).toBe(false);
  });

  it("unterminated string → PARSE_ERROR with position", () => {
    const r = parse('=ROUND(3, "oops)');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.position).toBeDefined();
  });
});
