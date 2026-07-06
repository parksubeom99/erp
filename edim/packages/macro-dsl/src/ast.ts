/**
 * @edim/macro-dsl — AST node types (grammar v1.0, STEP 0 §2).
 *
 * Every node carries a {@link Position} so downstream tools (executor, future
 * reverse-translator A5) can point at the exact source location. The node set
 * mirrors the ccmd hand-off list: Macro / If / TableCall / VarCall / ExtFn /
 * AddressRef / RunDirective.
 */
import type { Position } from "./errors";

export type Comparator = ">" | "<" | ">=" | "<=" | "=" | "<>";
export type BinaryOp = "+" | "-" | "*" | "/";

export interface NumberLiteral {
  readonly type: "Number";
  readonly value: number;
  readonly position: Position;
}

export interface StringLiteral {
  readonly type: "String";
  readonly value: string;
  readonly position: Position;
}

export interface BinaryExpr {
  readonly type: "Binary";
  readonly op: BinaryOp;
  readonly left: Expr;
  readonly right: Expr;
  readonly position: Position;
}

/** A Main Code / Child Code reference (GAP1: code-based BOM). */
export interface CodeRef {
  readonly type: "CodeRef";
  readonly name: string;
  readonly position: Position;
}

export interface Condition {
  readonly type: "Condition";
  readonly refs: readonly CodeRef[];
  readonly comparator: Comparator;
  readonly literal: NumberLiteral | StringLiteral;
  readonly position: Position;
}

export interface IfNode {
  readonly type: "If";
  readonly cond: Condition;
  readonly then: Expr;
  readonly otherwise: Expr;
  readonly position: Position;
}

export interface TableCall {
  readonly type: "TableCall";
  readonly tableId: string;
  readonly col: string;
  readonly rowRange: readonly [number, number];
  /** 3rd argument (`Cos2`): meaning RESERVED — parsed, never executed. */
  readonly aux?: string;
  readonly position: Position;
}

export interface VarCall {
  readonly type: "VarCall";
  readonly namespace: string;
  readonly id: string;
  readonly cell?: string;
  readonly position: Position;
}

/** PreC(int): meaning RESERVED — parsed, never executed. */
export interface PreCCall {
  readonly type: "PreC";
  readonly arg: number;
  readonly position: Position;
}

export interface AggCall {
  readonly type: "Agg";
  readonly fn: "SUM" | "MIN" | "MAX" | "AVG";
  readonly table: TableCall;
  readonly position: Position;
}

export interface LookupCall {
  readonly type: "Lookup";
  readonly key: Expr;
  readonly table: TableCall;
  readonly col: string;
  readonly position: Position;
}

export interface RoundCall {
  readonly type: "Round";
  readonly value: Expr;
  readonly digits: number;
  readonly position: Position;
}

export interface LogicCall {
  readonly type: "Logic";
  readonly op: "AND" | "OR";
  readonly conds: readonly Condition[];
  readonly position: Position;
}

export interface AddressRef {
  readonly type: "Address";
  readonly kind: "uri";
  readonly value: string;
  readonly position: Position;
}

export interface RunDirective {
  readonly type: "Run";
  readonly target:
    | { readonly kind: "item"; readonly ref: string }
    | { readonly kind: "number"; readonly value: number };
  readonly position: Position;
}

export type Expr =
  | NumberLiteral
  | StringLiteral
  | BinaryExpr
  | IfNode
  | TableCall
  | VarCall
  | PreCCall
  | AggCall
  | LookupCall
  | RoundCall
  | LogicCall
  | AddressRef;

export interface Macro {
  readonly type: "Macro";
  readonly body: Expr;
  readonly run?: RunDirective;
  readonly position: Position;
}
