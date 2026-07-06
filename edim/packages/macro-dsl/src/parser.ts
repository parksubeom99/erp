/**
 * @edim/macro-dsl — recursive-descent parser (grammar v1.0, STEP 0 §2).
 *
 * The grammar text in the STEP 0 spec is the SSOT. Notable authoring decisions
 * recorded in ccmd v2 (§ grammar realizations):
 *  - `ref_list` ends at the first comparator, so IF/AND/OR commas are
 *    unambiguous: a condition greedily takes comma-separated code_refs until a
 *    comparator appears, then the next comma is a list separator.
 *  - `table_range` (agg / lookup argument) is realized as a `Table(...)` ref.
 *  - `address_key` literal syntax is DEFERRED (corpus gave the field, not the
 *    surface form); only `uri_address` (edim://…) is accepted in v1.0.
 */
import type {
  AddressRef,
  AggCall,
  BinaryOp,
  Comparator,
  Condition,
  Expr,
  IfNode,
  LogicCall,
  LookupCall,
  Macro,
  NumberLiteral,
  PreCCall,
  RoundCall,
  RunDirective,
  StringLiteral,
  TableCall,
  VarCall,
} from "./ast";
import type { Position, Result } from "./errors";
import { err, ok } from "./errors";
import type { Token, TokenKind } from "./tokenizer";
import { tokenize, TokenizeError } from "./tokenizer";

class ParseError extends Error {
  constructor(
    message: string,
    readonly position: Position,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

const COMPARATORS: Partial<Record<TokenKind, Comparator>> = {
  GT: ">",
  LT: "<",
  GE: ">=",
  LE: "<=",
  EQ: "=",
  NE: "<>",
};

class Parser {
  private pos = 0;
  constructor(private readonly tokens: readonly Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos] as Token;
  }

  private next(): Token {
    const t = this.tokens[this.pos] as Token;
    if (t.kind !== "EOF") this.pos++;
    return t;
  }

  private expect(kind: TokenKind, what: string): Token {
    const t = this.peek();
    if (t.kind !== kind) {
      throw new ParseError(`expected ${what} but found '${t.text || "<eof>"}'`, t.position);
    }
    return this.next();
  }

  private isKeyword(word: string): boolean {
    const t = this.peek();
    return t.kind === "IDENT" && t.text === word;
  }

  parseMacro(): Macro {
    const startTok = this.peek();
    this.expect("EQ", "'=' at start of macro");
    const body = this.parseExpr();

    let run: RunDirective | undefined;
    if (this.isKeyword("Run")) {
      run = this.parseRun();
    }

    const trailing = this.peek();
    if (trailing.kind !== "EOF") {
      throw new ParseError(`unexpected trailing input '${trailing.text}'`, trailing.position);
    }
    return run
      ? { type: "Macro", body, run, position: startTok.position }
      : { type: "Macro", body, position: startTok.position };
  }

  private parseRun(): RunDirective {
    const runTok = this.next(); // 'Run'
    const t = this.peek();
    if (t.kind === "NUMBER") {
      this.next();
      return {
        type: "Run",
        target: { kind: "number", value: t.value as number },
        position: runTok.position,
      };
    }
    if (t.kind === "IDENT") {
      this.next();
      return {
        type: "Run",
        target: { kind: "item", ref: t.text },
        position: runTok.position,
      };
    }
    throw new ParseError(`expected Run target (number or item) but found '${t.text}'`, t.position);
  }

  /** expr := term { ("+"|"-"|"*"|"/") term }  (single precedence, left-assoc) */
  private parseExpr(): Expr {
    let left = this.parseTerm();
    while (this.peek().kind === "OP") {
      const opTok = this.next();
      const right = this.parseTerm();
      left = {
        type: "Binary",
        op: opTok.text as BinaryOp,
        left,
        right,
        position: opTok.position,
      };
    }
    return left;
  }

  private parseTerm(): Expr {
    const t = this.peek();
    switch (t.kind) {
      case "LPAREN": {
        this.next();
        const inner = this.parseExpr();
        this.expect("RPAREN", "')'");
        return inner;
      }
      case "NUMBER":
        this.next();
        return { type: "Number", value: t.value as number, position: t.position };
      case "STRING":
        this.next();
        return { type: "String", value: t.value as string, position: t.position };
      case "ADDRESS":
        this.next();
        return { type: "Address", kind: "uri", value: t.text, position: t.position } satisfies AddressRef;
      case "TABLE":
        return this.parseTable();
      case "IDENT":
        return this.parseIdentTerm();
      default:
        throw new ParseError(`unexpected token '${t.text || "<eof>"}'`, t.position);
    }
  }

  private parseIdentTerm(): Expr {
    const word = this.peek().text;
    switch (word) {
      case "IF":
        return this.parseIf();
      case "Var":
        return this.parseVar();
      case "PreC":
        return this.parsePreC();
      case "SUM":
      case "MIN":
      case "MAX":
      case "AVG":
        return this.parseAgg();
      case "LOOKUP":
        return this.parseLookup();
      case "ROUND":
        return this.parseRound();
      case "AND":
      case "OR":
        return this.parseLogic();
      default: {
        // A bare identifier is not a valid term (code_refs live only inside a
        // condition). Reject deterministically rather than guess.
        const t = this.peek();
        throw new ParseError(`'${word}' is not a valid expression here`, t.position);
      }
    }
  }

  private parseIf(): IfNode {
    const kw = this.next(); // IF
    this.expect("LPAREN", "'(' after IF");
    const cond = this.parseCondition();
    this.expect("COMMA", "',' after IF condition");
    const then = this.parseExpr();
    this.expect("COMMA", "',' before IF else-branch");
    const otherwise = this.parseExpr();
    this.expect("RPAREN", "')' to close IF");
    return { type: "If", cond, then, otherwise, position: kw.position };
  }

  /** cond := ref_list comparator literal ; ref_list := code_ref { "," code_ref } */
  private parseCondition(): Condition {
    const first = this.peek();
    const refs = [this.parseCodeRef()];
    // Keep taking code_refs while the next comma is followed by another ident
    // and we have not yet reached the comparator.
    while (this.peek().kind === "COMMA" && this.tokenAfterComma().kind === "IDENT") {
      this.next(); // ','
      refs.push(this.parseCodeRef());
    }
    const comparator = this.parseComparator();
    const literal = this.parseLiteral();
    return { type: "Condition", refs, comparator, literal, position: first.position };
  }

  private tokenAfterComma(): Token {
    return (this.tokens[this.pos + 1] ?? this.tokens[this.tokens.length - 1]) as Token;
  }

  private parseCodeRef(): Condition["refs"][number] {
    const t = this.expect("IDENT", "a code reference");
    return { type: "CodeRef", name: t.text, position: t.position };
  }

  private parseComparator(): Comparator {
    const t = this.peek();
    const cmp = COMPARATORS[t.kind];
    if (!cmp) {
      throw new ParseError(`expected a comparator but found '${t.text || "<eof>"}'`, t.position);
    }
    this.next();
    return cmp;
  }

  private parseLiteral(): NumberLiteral | StringLiteral {
    const t = this.peek();
    if (t.kind === "NUMBER") {
      this.next();
      return { type: "Number", value: t.value as number, position: t.position };
    }
    if (t.kind === "STRING") {
      this.next();
      return { type: "String", value: t.value as string, position: t.position };
    }
    throw new ParseError(`expected a literal but found '${t.text || "<eof>"}'`, t.position);
  }

  private parseTable(): TableCall {
    const tbl = this.expect("TABLE", "a Table reference");
    this.expect("LPAREN", "'(' after Table");
    const col = this.expect("IDENT", "a column").text;
    this.expect("COMMA", "',' after column");
    const r0 = this.expect("NUMBER", "start row").value as number;
    this.expect("COLON", "':' in row range");
    const r1 = this.expect("NUMBER", "end row").value as number;
    let aux: string | undefined;
    if (this.peek().kind === "COMMA") {
      this.next();
      aux = this.expect("IDENT", "aux argument").text;
    }
    this.expect("RPAREN", "')' to close Table");
    const base = {
      type: "TableCall" as const,
      tableId: tbl.value as string,
      col,
      rowRange: [r0, r1] as [number, number],
      position: tbl.position,
    };
    return aux ? { ...base, aux } : base;
  }

  private parseVar(): VarCall {
    const kw = this.next(); // Var
    this.expect("LPAREN", "'(' after Var");
    const namespace = this.expect("IDENT", "a namespace").text;
    this.expect("COMMA", "',' after namespace");
    const idTok = this.peek();
    let id: string;
    if (idTok.kind === "NUMBER" || idTok.kind === "IDENT") {
      this.next();
      id = idTok.text;
    } else {
      throw new ParseError(`expected a Var id but found '${idTok.text}'`, idTok.position);
    }
    let cell: string | undefined;
    if (this.peek().kind === "COMMA") {
      this.next();
      cell = this.expect("IDENT", "a cell reference").text;
    }
    this.expect("RPAREN", "')' to close Var");
    const base = { type: "VarCall" as const, namespace, id, position: kw.position };
    return cell ? { ...base, cell } : base;
  }

  private parsePreC(): PreCCall {
    const kw = this.next(); // PreC
    this.expect("LPAREN", "'(' after PreC");
    const arg = this.expect("NUMBER", "an integer").value as number;
    this.expect("RPAREN", "')' to close PreC");
    return { type: "PreC", arg, position: kw.position };
  }

  private parseAgg(): AggCall {
    const kw = this.next(); // SUM|MIN|MAX|AVG
    this.expect("LPAREN", `'(' after ${kw.text}`);
    const table = this.parseTable();
    this.expect("RPAREN", `')' to close ${kw.text}`);
    return { type: "Agg", fn: kw.text as AggCall["fn"], table, position: kw.position };
  }

  private parseLookup(): LookupCall {
    const kw = this.next(); // LOOKUP
    this.expect("LPAREN", "'(' after LOOKUP");
    const key = this.parseExpr();
    this.expect("COMMA", "',' after LOOKUP key");
    const table = this.parseTable();
    this.expect("COMMA", "',' after LOOKUP table");
    const col = this.expect("IDENT", "a return column").text;
    this.expect("RPAREN", "')' to close LOOKUP");
    return { type: "Lookup", key, table, col, position: kw.position };
  }

  private parseRound(): RoundCall {
    const kw = this.next(); // ROUND
    this.expect("LPAREN", "'(' after ROUND");
    const value = this.parseExpr();
    this.expect("COMMA", "',' after ROUND value");
    const digits = this.expect("NUMBER", "digit count").value as number;
    this.expect("RPAREN", "')' to close ROUND");
    return { type: "Round", value, digits, position: kw.position };
  }

  private parseLogic(): LogicCall {
    const kw = this.next(); // AND|OR
    this.expect("LPAREN", `'(' after ${kw.text}`);
    const conds = [this.parseCondition()];
    while (this.peek().kind === "COMMA") {
      this.next();
      conds.push(this.parseCondition());
    }
    this.expect("RPAREN", `')' to close ${kw.text}`);
    return { type: "Logic", op: kw.text as "AND" | "OR", conds, position: kw.position };
  }
}

/**
 * Parse a macro string into an AST. Never throws — lexical and syntactic
 * failures come back as a PARSE_ERROR {@link Result} carrying a position.
 */
export function parse(source: string): Result<Macro> {
  let tokens: Token[];
  try {
    tokens = tokenize(source);
  } catch (e) {
    if (e instanceof TokenizeError) return err("PARSE_ERROR", e.message, e.position);
    throw e;
  }
  try {
    return ok(new Parser(tokens).parseMacro());
  } catch (e) {
    if (e instanceof ParseError) return err("PARSE_ERROR", e.message, e.position);
    throw e;
  }
}
