import { describe, expect, it } from "vitest";
import { evaluate, InMemoryProvider, parse } from "../src/index";
import type { DataProvider, EvalValue, MacroErrorCode } from "../src/index";

const provider: DataProvider = new InMemoryProvider({
  tables: {
    "1!A": { 1: 10, 2: 20, 3: 30 },
    "1!B": { 1: 100, 2: 200, 3: 300 },
  },
  vars: { "NS|15|F3": 42, "NS|15": 7 },
  addresses: { "edim://tenant/t1/plm/casing/double": 5 },
  codes: { A: 6, B: 7, C: 1, MC: 600, CC: 700 },
});

/** parse then evaluate; throws on parse error so exec assertions stay focused. */
function run(src: string): EvalValue {
  const p = parse(src);
  if (!p.ok) throw new Error(`parse failed: ${p.error.message}`);
  const r = evaluate(p.value, provider);
  if (!r.ok) throw new Error(`eval failed: ${r.error.code} ${r.error.message}`);
  return r.value;
}

/** parse then evaluate, expecting a specific closed-world error code. */
function runErr(src: string): MacroErrorCode {
  const p = parse(src);
  if (!p.ok) throw new Error(`parse failed: ${p.error.message}`);
  const r = evaluate(p.value, provider);
  if (r.ok) throw new Error(`expected error but got value ${JSON.stringify(r.value)}`);
  return r.error.code;
}

describe("execute — arithmetic and functions", () => {
  it("IF true branch", () => expect(run("=IF(A,B>5, 10, 20)")).toBe(10));
  it("IF false branch", () => expect(run("=IF(C,C>5, 10, 20)")).toBe(20));
  it("Table resolves to a range", () => expect(run("=Table1(A,1:3)")).toEqual([10, 20, 30]));
  it("Var with cell", () => expect(run("=Var(NS,15,F3)")).toBe(42));
  it("Var without cell", () => expect(run("=Var(NS,15)")).toBe(7));
  it("SUM", () => expect(run("=SUM(Table1(A,1:3))")).toBe(60));
  it("MIN", () => expect(run("=MIN(Table1(A,1:3))")).toBe(10));
  it("MAX", () => expect(run("=MAX(Table1(A,1:3))")).toBe(30));
  it("AVG", () => expect(run("=AVG(Table1(A,1:3))")).toBe(20));
  it("LOOKUP", () => expect(run("=LOOKUP(20, Table1(A,1:3), B)")).toBe(200));
  it("ROUND", () => expect(run("=ROUND(3.14159, 2)")).toBe(3.14));
  it("AND true", () => expect(run("=AND(A>5, B>5)")).toBe(1));
  it("AND false", () => expect(run("=AND(A>5, C>5)")).toBe(0));
  it("OR true", () => expect(run("=OR(C>5, B>5)")).toBe(1));
  it("arithmetic composition", () => expect(run("=SUM(Table1(A,1:3))+Var(NS,15)")).toBe(67));
  it("uri address resolves", () => expect(run("=edim://tenant/t1/plm/casing/double")).toBe(5));
});

describe("execute — reserved locks (never guessed)", () => {
  it("PreC → RESERVED_FN", () => expect(runErr("=PreC(1)")).toBe("RESERVED_FN"));
  it("Table aux (Cos2) → RESERVED_ARG", () =>
    expect(runErr("=Table1(A,1:3,Cos2)")).toBe("RESERVED_ARG"));
  it("Var FES namespace → RESERVED_ARG", () =>
    expect(runErr("=Var(FES,15,F3)")).toBe("RESERVED_ARG"));
  it("golden formula refuses to evaluate (reserved), not a bogus number", () => {
    const code = runErr(
      "=IF(MC,CC>500, Table12(E,10:25,Cos2)+Var(FES,15,F3), Table12(E,10:25,Cos2)+Var(FES,15,F3))*PreC(1)",
    );
    expect(["RESERVED_ARG", "RESERVED_FN"]).toContain(code);
  });
});

describe("execute — closed-world errors", () => {
  it("unknown Var → UNKNOWN_SYMBOL", () => expect(runErr("=Var(NS,99)")).toBe("UNKNOWN_SYMBOL"));
  it("unknown Table → UNKNOWN_SYMBOL", () => expect(runErr("=Table9(Z,1:2)")).toBe("UNKNOWN_SYMBOL"));
  it("unknown code in condition → UNKNOWN_SYMBOL", () =>
    expect(runErr("=IF(ZZ,ZZ>5, 1, 2)")).toBe("UNKNOWN_SYMBOL"));
  it("type error: range in arithmetic → TYPE_ERROR", () =>
    expect(runErr("=Table1(A,1:3)+1")).toBe("TYPE_ERROR"));
  it("division by zero → TYPE_ERROR", () => expect(runErr("=10/0")).toBe("TYPE_ERROR"));
});
