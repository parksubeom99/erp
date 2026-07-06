/**
 * @edim/macro-verify — static checks (Part① A6, deterministic, no provider).
 *
 * Three static checks run without a DataProvider:
 *   ② address existence — every edim:// AddressRef must resolve in the tree,
 *      reusing @edim/hierarchy-address (the A2 resolver seam).
 *   ③ type / unit — arithmetic, ROUND, LOOKUP operand types, literal-zero
 *      division and string comparison, mirroring the executor's statically
 *      decidable TYPE_ERROR paths (data-dependent cases fall to dry-run).
 *   reserved surfacing — PreC / Table 3rd arg / Var(FES) become *warnings*
 *      ("미구현 사양 · NOVA 회신 대기"), not the executor's hard errors.
 *
 * ④ cycle detection is intentionally a no-op in grammar v1.0 — see checkCycles.
 */
import type { Condition, Expr, Macro } from "@edim/macro-dsl";
import { RESERVED_VAR_NAMESPACES } from "@edim/macro-dsl";
import type { HierarchyTreeNode } from "@edim/core-ontology";
import { resolveUri } from "@edim/hierarchy-address";
import type { Diagnostic } from "./diagnostic";
import { diagnostic } from "./diagnostic";

export interface VerifyContext {
  readonly tree: readonly HierarchyTreeNode[];
  /** Tenant owning `tree`; a URI naming another tenant fails closed. */
  readonly tenantId?: string;
}

type StaticType = "number" | "number[]" | "string" | "unknown";

/** Pre-order visit of every Expr node (conditions are handled by the type pass). */
function visit(node: Expr, fn: (n: Expr) => void): void {
  fn(node);
  switch (node.type) {
    case "Binary":
      visit(node.left, fn);
      visit(node.right, fn);
      break;
    case "If":
      visit(node.then, fn);
      visit(node.otherwise, fn);
      break;
    case "Agg":
      visit(node.table, fn);
      break;
    case "Lookup":
      visit(node.key, fn);
      visit(node.table, fn);
      break;
    case "Round":
      visit(node.value, fn);
      break;
    default:
      break;
  }
}

function checkReserved(macro: Macro, out: Diagnostic[]): void {
  visit(macro.body, (n) => {
    if (n.type === "PreC") {
      out.push(diagnostic("warning", "RESERVED_FN", "PreC — 미구현 사양 · NOVA 회신 대기", n.position));
    } else if (n.type === "TableCall" && n.aux !== undefined) {
      out.push(
        diagnostic("warning", "RESERVED_ARG", `Table 3rd argument '${n.aux}' — 미구현 사양 · NOVA 회신 대기`, n.position),
      );
    } else if (n.type === "VarCall" && RESERVED_VAR_NAMESPACES.has(n.namespace)) {
      out.push(
        diagnostic("warning", "RESERVED_ARG", `Var namespace '${n.namespace}' — 미구현 사양 · NOVA 회신 대기`, n.position),
      );
    }
  });
}

function checkAddresses(macro: Macro, ctx: VerifyContext, out: Diagnostic[]): void {
  const options = ctx.tenantId !== undefined ? { tenantId: ctx.tenantId } : {};
  visit(macro.body, (n) => {
    if (n.type === "Address") {
      const r = resolveUri(ctx.tree, n.value, options);
      if (!r.ok) {
        out.push(
          diagnostic("error", "ADDRESS_UNKNOWN", `address '${n.value}' — ${r.error.code}: ${r.error.message}`, n.position),
        );
      }
    }
  });
}

/** Infer a node's static value type, pushing TYPE_ERROR where the executor would. */
function typeOf(node: Expr, out: Diagnostic[]): StaticType {
  switch (node.type) {
    case "Number":
      return "number";
    case "String":
      return "string";
    case "VarCall":
      return "number";
    case "Address":
      return "number";
    case "TableCall":
      return "number[]";
    case "PreC":
      return "unknown";
    case "Agg":
      typeOf(node.table, out);
      return "number";
    case "Round": {
      const t = typeOf(node.value, out);
      if (t === "string" || t === "number[]") {
        out.push(diagnostic("error", "TYPE_ERROR", "ROUND requires a number", node.position));
      }
      return "number";
    }
    case "Lookup": {
      const kt = typeOf(node.key, out);
      typeOf(node.table, out);
      if (kt === "string" || kt === "number[]") {
        out.push(diagnostic("error", "TYPE_ERROR", "LOOKUP key must be a number in v1.0", node.position));
      }
      return "number";
    }
    case "Logic": {
      for (const c of node.conds) checkCondition(c, out);
      return "number";
    }
    case "Binary": {
      const l = typeOf(node.left, out);
      const r = typeOf(node.right, out);
      if (l === "string" || l === "number[]" || r === "string" || r === "number[]") {
        out.push(diagnostic("error", "TYPE_ERROR", `operator '${node.op}' requires numbers`, node.position));
      }
      if (node.op === "/" && node.right.type === "Number" && node.right.value === 0) {
        out.push(diagnostic("error", "TYPE_ERROR", "division by zero", node.position));
      }
      return "number";
    }
    case "If": {
      checkCondition(node.cond, out);
      const a = typeOf(node.then, out);
      const b = typeOf(node.otherwise, out);
      return a === b ? a : "unknown";
    }
  }
}

function checkCondition(cond: Condition, out: Diagnostic[]): void {
  if (cond.literal.type === "String") {
    out.push(diagnostic("error", "TYPE_ERROR", "string comparison is unsupported in v1.0", cond.position));
  }
}

/**
 * ④ Cycle detection — deferred until named-macro references (STEP 5+).
 *
 * Grammar v1.0's Expr union has no macro→macro node, so a macro is always a
 * finite tree and no cycle can be constructed. A check here could never produce
 * a failing case; it is re-activated when a macro registry lets one macro name
 * another. This seam keeps the re-activation point explicit.
 */
export function checkCycles(_macro: Macro): Diagnostic[] {
  return [];
}

/** Run the static checks (②③ + reserved + ④ seam) over a parsed macro. */
export function verifyAst(macro: Macro, ctx: VerifyContext): Diagnostic[] {
  const out: Diagnostic[] = [];
  typeOf(macro.body, out);
  checkAddresses(macro, ctx, out);
  checkReserved(macro, out);
  out.push(...checkCycles(macro));
  return out;
}
