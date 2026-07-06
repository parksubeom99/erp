/**
 * @edim/macro-dsl — Macro DSL parser + deterministic executor (Part① STEP 1).
 *
 * Dependency rule (non-negotiable): this package imports NOTHING from higher
 * layers (db, auth, ui, apps). Only @edim/core-ontology is permitted. No LLM,
 * no network, no DB — those are STEP 2+ and belong elsewhere.
 *
 * Public surface:
 *   parse(source)            → Result<Macro>      (tokenizer + recursive descent)
 *   evaluate(macro, provider)→ Result<EvalValue>  (closed-world executor)
 *   InMemoryProvider         → mock DataProvider for the direct-input path
 */
export const MACRO_DSL_PACKAGE = "@edim/macro-dsl" as const;
export const GRAMMAR_VERSION = "1.0" as const;

export { parse } from "./parser";
export { evaluate } from "./executor";
export type { EvalValue } from "./executor";
export { InMemoryProvider } from "./provider";
export type { DataProvider } from "./provider";
export { RESERVED_VAR_NAMESPACES } from "./errors";
export type { MacroError, MacroErrorCode, Result, Position } from "./errors";
export type {
  Macro,
  Expr,
  IfNode,
  Condition,
  CodeRef,
  TableCall,
  VarCall,
  PreCCall,
  AggCall,
  LookupCall,
  RoundCall,
  LogicCall,
  AddressRef,
  RunDirective,
  Comparator,
  BinaryOp,
} from "./ast";
