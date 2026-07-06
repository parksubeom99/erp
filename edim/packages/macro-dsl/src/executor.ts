/**
 * @edim/macro-dsl — deterministic executor (no LLM).
 *
 * Evaluates an approved AST against an injected {@link DataProvider}. The
 * closed-world contract: every path either returns a value or one of the five
 * error codes — never a guess. The three blueprint-gap tokens are locked here:
 *   PreC(…)                 → RESERVED_FN
 *   Table(…, aux)           → RESERVED_ARG   (3rd arg meaning undefined)
 *   Var(FES, …)             → RESERVED_ARG   (namespace meaning undefined)
 *
 * v1.0 value domain: number | number[] | string. Logic functions yield 1/0.
 */
import type {
  Condition,
  Expr,
  Macro,
  TableCall,
} from "./ast";
import type { MacroError, Result } from "./errors";
import { err, ok, RESERVED_VAR_NAMESPACES } from "./errors";
import type { DataProvider } from "./provider";

export type EvalValue = number | number[] | string;

/** Evaluate a parsed macro's body. The Run directive is metadata, not a value. */
export function evaluate(macro: Macro, provider: DataProvider): Result<EvalValue> {
  return evalExpr(macro.body, provider);
}

function evalExpr(node: Expr, provider: DataProvider): Result<EvalValue> {
  switch (node.type) {
    case "Number":
      return ok(node.value);
    case "String":
      return ok(node.value);

    case "Binary": {
      const l = evalExpr(node.left, provider);
      if (!l.ok) return l;
      const r = evalExpr(node.right, provider);
      if (!r.ok) return r;
      const ln = asNumber(l.value);
      const rn = asNumber(r.value);
      if (ln === undefined || rn === undefined) {
        return err("TYPE_ERROR", `operator '${node.op}' requires numbers`, node.position);
      }
      switch (node.op) {
        case "+":
          return ok(ln + rn);
        case "-":
          return ok(ln - rn);
        case "*":
          return ok(ln * rn);
        case "/":
          return rn === 0
            ? err("TYPE_ERROR", "division by zero", node.position)
            : ok(ln / rn);
      }
    }

    case "If": {
      const c = evalCondition(node.cond, provider);
      if (!c.ok) return c;
      return evalExpr(c.value ? node.then : node.otherwise, provider);
    }

    case "TableCall":
      return evalTable(node, provider);

    case "VarCall": {
      if (RESERVED_VAR_NAMESPACES.has(node.namespace)) {
        return err(
          "RESERVED_ARG",
          `Var namespace '${node.namespace}' meaning is undefined (NOVA confirmation pending)`,
          node.position,
        );
      }
      const v = provider.resolveVar(node.namespace, node.id, node.cell);
      return v === undefined
        ? err("UNKNOWN_SYMBOL", `Var(${node.namespace}, ${node.id}) is unknown`, node.position)
        : ok(v);
    }

    case "PreC":
      return err(
        "RESERVED_FN",
        "PreC argument meaning is undefined (NOVA confirmation pending)",
        node.position,
      );

    case "Agg": {
      const t = evalTable(node.table, provider);
      if (!t.ok) return t;
      const arr = t.value;
      if (!Array.isArray(arr) || arr.length === 0) {
        return err("TYPE_ERROR", `${node.fn} requires a non-empty range`, node.position);
      }
      switch (node.fn) {
        case "SUM":
          return ok(arr.reduce((a, b) => a + b, 0));
        case "MIN":
          return ok(Math.min(...arr));
        case "MAX":
          return ok(Math.max(...arr));
        case "AVG":
          return ok(arr.reduce((a, b) => a + b, 0) / arr.length);
      }
    }

    case "Lookup": {
      if (node.table.aux !== undefined) {
        return err("RESERVED_ARG", "Table 3rd argument meaning is undefined", node.table.position);
      }
      const key = evalExpr(node.key, provider);
      if (!key.ok) return key;
      const keyNum = asNumber(key.value);
      if (keyNum === undefined) {
        return err("TYPE_ERROR", "LOOKUP key must be a number in v1.0", node.position);
      }
      const keyCol = provider.resolveTable(node.table.tableId, node.table.col, node.table.rowRange);
      const retCol = provider.resolveTable(node.table.tableId, node.col, node.table.rowRange);
      if (!keyCol || !retCol) {
        return err("UNKNOWN_SYMBOL", "LOOKUP range is unknown", node.position);
      }
      const idx = keyCol.indexOf(keyNum);
      if (idx < 0 || idx >= retCol.length) {
        return err("UNKNOWN_SYMBOL", `LOOKUP key ${keyNum} not found`, node.position);
      }
      return ok(retCol[idx] as number);
    }

    case "Round": {
      const v = evalExpr(node.value, provider);
      if (!v.ok) return v;
      const n = asNumber(v.value);
      if (n === undefined) return err("TYPE_ERROR", "ROUND requires a number", node.position);
      const f = Math.pow(10, node.digits);
      return ok(Math.round(n * f) / f);
    }

    case "Logic": {
      const results: boolean[] = [];
      for (const cond of node.conds) {
        const c = evalCondition(cond, provider);
        if (!c.ok) return c;
        results.push(c.value);
      }
      const truth = node.op === "AND" ? results.every(Boolean) : results.some(Boolean);
      return ok(truth ? 1 : 0);
    }

    case "Address": {
      const v = provider.resolveAddress(node.value);
      return v === undefined
        ? err("UNKNOWN_SYMBOL", `address '${node.value}' is unknown`, node.position)
        : ok(v);
    }
  }
}

function evalTable(node: TableCall, provider: DataProvider): Result<EvalValue> {
  if (node.aux !== undefined) {
    return err(
      "RESERVED_ARG",
      `Table 3rd argument '${node.aux}' meaning is undefined (NOVA confirmation pending)`,
      node.position,
    );
  }
  const cells = provider.resolveTable(node.tableId, node.col, node.rowRange);
  return cells === undefined
    ? err("UNKNOWN_SYMBOL", `Table${node.tableId}(${node.col}, ${node.rowRange[0]}:${node.rowRange[1]}) is unknown`, node.position)
    : ok(cells);
}

function evalCondition(cond: Condition, provider: DataProvider): Result<boolean> {
  const litIsNumber = cond.literal.type === "Number";
  for (const ref of cond.refs) {
    const value = provider.resolveCodeRef(ref.name);
    if (value === undefined) {
      return err("UNKNOWN_SYMBOL", `code '${ref.name}' is unknown`, ref.position);
    }
    if (!litIsNumber) {
      return err("TYPE_ERROR", "string comparison is unsupported in v1.0", cond.position);
    }
    if (!compare(value, cond.comparator, cond.literal.value as number)) {
      return ok(false); // AND semantics across refs
    }
  }
  return ok(true);
}

function compare(a: number, op: Condition["comparator"], b: number): boolean {
  switch (op) {
    case ">":
      return a > b;
    case "<":
      return a < b;
    case ">=":
      return a >= b;
    case "<=":
      return a <= b;
    case "=":
      return a === b;
    case "<>":
      return a !== b;
  }
}

function asNumber(v: EvalValue): number | undefined {
  return typeof v === "number" ? v : undefined;
}

export type { MacroError };
