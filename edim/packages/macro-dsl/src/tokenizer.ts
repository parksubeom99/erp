/**
 * @edim/macro-dsl — tokenizer.
 *
 * Turns raw macro text into a flat token stream with 1-based line/col on every
 * token. Two lexemes need special care because the grammar concatenates them:
 *  - `Table12`  → a TABLE token carrying tableId "12" (grammar: `"Table" table_id`)
 *  - `edim://…` → a single ADDRESS token (URIs embed the `/` and `:` delimiters)
 */
import type { Position } from "./errors";

export type TokenKind =
  | "EQ" // '='  (macro start and the '=' comparator)
  | "OP" // + - * /
  | "GT"
  | "LT"
  | "GE"
  | "LE"
  | "NE"
  | "LPAREN"
  | "RPAREN"
  | "COMMA"
  | "COLON"
  | "NUMBER"
  | "STRING"
  | "TABLE"
  | "ADDRESS"
  | "IDENT"
  | "EOF";

export interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly position: Position;
  /** NUMBER → numeric value; TABLE → tableId string. */
  readonly value?: number | string;
}

export class TokenizeError extends Error {
  constructor(
    message: string,
    readonly position: Position,
  ) {
    super(message);
    this.name = "TokenizeError";
  }
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;
const ADDRESS_PART = /[A-Za-z0-9_\-./:{}]/;

/**
 * @throws {TokenizeError} on an unterminated string or unrecognized character.
 */
export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const at = (k: number): string => (k < src.length ? (src[k] as string) : "");
  const here = (): Position => ({ line, col });

  const advance = (n: number): void => {
    for (let k = 0; k < n; k++) {
      if (at(i) === "\n") {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < src.length) {
    const c = at(i);

    // whitespace
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      advance(1);
      continue;
    }

    const start = here();

    // edim:// address (must precede the identifier branch)
    if (src.startsWith("edim://", i)) {
      let j = i;
      while (j < src.length && ADDRESS_PART.test(at(j))) j++;
      const text = src.slice(i, j);
      tokens.push({ kind: "ADDRESS", text, position: start });
      advance(j - i);
      continue;
    }

    // Table<digits>  →  TABLE token
    if (src.startsWith("Table", i) && DIGIT.test(at(i + 5))) {
      let j = i + 5;
      while (j < src.length && DIGIT.test(at(j))) j++;
      const id = src.slice(i + 5, j);
      tokens.push({ kind: "TABLE", text: src.slice(i, j), position: start, value: id });
      advance(j - i);
      continue;
    }

    // identifier / keyword
    if (IDENT_START.test(c)) {
      let j = i;
      while (j < src.length && IDENT_PART.test(at(j))) j++;
      tokens.push({ kind: "IDENT", text: src.slice(i, j), position: start });
      advance(j - i);
      continue;
    }

    // number
    if (DIGIT.test(c)) {
      let j = i;
      while (j < src.length && DIGIT.test(at(j))) j++;
      if (at(j) === "." && DIGIT.test(at(j + 1))) {
        j++;
        while (j < src.length && DIGIT.test(at(j))) j++;
      }
      const text = src.slice(i, j);
      tokens.push({ kind: "NUMBER", text, position: start, value: Number(text) });
      advance(j - i);
      continue;
    }

    // string
    if (c === '"') {
      let j = i + 1;
      while (j < src.length && at(j) !== '"') j++;
      if (j >= src.length) {
        throw new TokenizeError("unterminated string literal", start);
      }
      const text = src.slice(i + 1, j);
      tokens.push({ kind: "STRING", text, position: start, value: text });
      advance(j - i + 1); // include closing quote
      continue;
    }

    // multi-char comparators
    if (c === ">" && at(i + 1) === "=") {
      tokens.push({ kind: "GE", text: ">=", position: start });
      advance(2);
      continue;
    }
    if (c === "<" && at(i + 1) === "=") {
      tokens.push({ kind: "LE", text: "<=", position: start });
      advance(2);
      continue;
    }
    if (c === "<" && at(i + 1) === ">") {
      tokens.push({ kind: "NE", text: "<>", position: start });
      advance(2);
      continue;
    }

    // single-char punctuation / operators
    switch (c) {
      case "=":
        tokens.push({ kind: "EQ", text: c, position: start });
        advance(1);
        continue;
      case ">":
        tokens.push({ kind: "GT", text: c, position: start });
        advance(1);
        continue;
      case "<":
        tokens.push({ kind: "LT", text: c, position: start });
        advance(1);
        continue;
      case "+":
      case "-":
      case "*":
      case "/":
        tokens.push({ kind: "OP", text: c, position: start });
        advance(1);
        continue;
      case "(":
        tokens.push({ kind: "LPAREN", text: c, position: start });
        advance(1);
        continue;
      case ")":
        tokens.push({ kind: "RPAREN", text: c, position: start });
        advance(1);
        continue;
      case ",":
        tokens.push({ kind: "COMMA", text: c, position: start });
        advance(1);
        continue;
      case ":":
        tokens.push({ kind: "COLON", text: c, position: start });
        advance(1);
        continue;
      default:
        throw new TokenizeError(`unexpected character '${c}'`, start);
    }
  }

  tokens.push({ kind: "EOF", text: "", position: here() });
  return tokens;
}
