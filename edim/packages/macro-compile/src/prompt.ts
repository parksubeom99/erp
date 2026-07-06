/**
 * @edim/macro-compile — prompt construction (Part① A4).
 *
 * The system prompt IS the target-language spec: it mirrors the grammar the
 * @edim/macro-dsl parser accepts (13 case-sensitive names + address + arithmetic)
 * and the reserved tokens the executor refuses. The few-shot examples are drawn
 * from the same worked cases the parser/executor tests pin, so the prompt and
 * the validator never drift. Deterministic — pure string building.
 */
import type { Diagnostic } from "@edim/macro-verify";

export const SYSTEM_PROMPT = `You translate a natural-language request (Korean or English) into ONE line of the EDIM Macro DSL. Output ONLY the macro line — no prose, no code fences, no explanation.

Rules:
- The macro is a single formula and MUST start with '='.
- Function names are case-sensitive. Use exactly: IF, Table, Var, SUM, MIN, MAX, AVG, LOOKUP, ROUND, AND, OR, Run.

Grammar:
- =IF(codes, code CMP number, thenExpr, elseExpr)   CMP is one of > < >= <= = <>
- =Table<id>(col, row1:row2)                          e.g. =Table12(A,1:3)
- =Var(NS, id[, cell])
- =SUM|MIN|MAX|AVG(Table<id>(col,row1:row2))
- =LOOKUP(key, Table<id>(col,row1:row2), returnCol)
- =ROUND(expr, digits)
- =AND|OR(code CMP number, code CMP number, ...)
- arithmetic: + - * /  (numbers only; a Table range is not a number)
- address: =edim://tenant/<tenantId>/<segment>/<segment>...

Reserved — DO NOT emit unless the user explicitly asks (their meaning is undefined):
- PreC(n), a 3rd argument to Table(...), and Var(FES, ...)

Examples:
- sum of column A rows 1..3 of table 1        -> =SUM(Table1(A,1:3))
- variable 15 in namespace NS                  -> =Var(NS,15)
- if code A is over 5 then 10 else 20          -> =IF(A,A>5, 10, 20)
- round 3.14159 to 2 decimals                  -> =ROUND(3.14159, 2)
- average of column A rows 1..3 of table 1     -> =AVG(Table1(A,1:3))
- value at node ahu-01 under edim-set-up (tenant T) -> =edim://tenant/T/edim-set-up/ahu-01

Return exactly one line beginning with '='.`;

/** The initial user turn: just the request. */
export function buildUserPrompt(request: string): string {
  return `Request: ${request}`;
}

/**
 * The retry user turn: the rejected candidate plus the verifier's diagnostics,
 * so the model can fix the specific error rather than guess again.
 */
export function buildRetryPrompt(request: string, candidate: string, diagnostics: readonly Diagnostic[]): string {
  const errors = diagnostics
    .filter((d) => d.severity === "error")
    .map((d) => {
      const where = d.position ? ` (line ${d.position.line}, col ${d.position.col})` : "";
      return `- ${d.code}: ${d.message}${where}`;
    })
    .join("\n");
  return `Request: ${request}

Your previous answer did not compile:
${candidate}

Compiler errors:
${errors}

Fix these and return exactly one corrected macro line beginning with '='.`;
}
