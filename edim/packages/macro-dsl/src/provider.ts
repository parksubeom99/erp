/**
 * @edim/macro-dsl — DataProvider boundary.
 *
 * The executor never reaches into the database. It resolves every external
 * symbol through this injected interface. STEP 1 ships only the in-memory mock;
 * the real Address Resolver (edim:// ↔ internal form) and DB-backed providers
 * are STEP 2 and beyond — deliberately NOT built here.
 *
 * Interface note (recorded in ccmd v2): the ccmd sketched resolveTable /
 * resolveVar / resolveAddress. `resolveCodeRef` is added in v1.0 because IF
 * conditions compare code values, and GAP1 fixed BOM as code-based — a code
 * must therefore be resolvable to a value. `aux` is intentionally absent from
 * resolveTable: the 3rd Table argument is RESERVED and short-circuits in the
 * executor before any provider call.
 *
 * A provider returns `undefined` for an unknown symbol; the executor maps that
 * to UNKNOWN_SYMBOL. No provider throws.
 */
export interface DataProvider {
  resolveTable(tableId: string, col: string, rowRange: readonly [number, number]): number[] | undefined;
  resolveVar(namespace: string, id: string, cell?: string): number | undefined;
  resolveAddress(ref: string): number | undefined;
  resolveCodeRef(name: string): number | undefined;
}

interface InMemoryData {
  /** key `${tableId}!${col}` → { row → value } */
  readonly tables?: Record<string, Record<number, number>>;
  /** key `${namespace}|${id}` or `${namespace}|${id}|${cell}` → value */
  readonly vars?: Record<string, number>;
  readonly addresses?: Record<string, number>;
  readonly codes?: Record<string, number>;
}

/** Deterministic in-memory provider for tests and the direct-input path. */
export class InMemoryProvider implements DataProvider {
  constructor(private readonly data: InMemoryData) {}

  resolveTable(tableId: string, col: string, rowRange: readonly [number, number]): number[] | undefined {
    const column = this.data.tables?.[`${tableId}!${col}`];
    if (!column) return undefined;
    const [start, end] = rowRange;
    const out: number[] = [];
    for (let r = start; r <= end; r++) {
      const cell = column[r];
      if (cell === undefined) return undefined; // any missing cell → unknown
      out.push(cell);
    }
    return out;
  }

  resolveVar(namespace: string, id: string, cell?: string): number | undefined {
    const vars = this.data.vars;
    if (!vars) return undefined;
    if (cell !== undefined) {
      const withCell = vars[`${namespace}|${id}|${cell}`];
      if (withCell !== undefined) return withCell;
    }
    return vars[`${namespace}|${id}`];
  }

  resolveAddress(ref: string): number | undefined {
    return this.data.addresses?.[ref];
  }

  resolveCodeRef(name: string): number | undefined {
    return this.data.codes?.[name];
  }
}
