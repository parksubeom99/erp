/**
 * @edim/macro-compile — LLM boundary (Part① A4).
 *
 * The compiler never reaches the network. It reaches the LLM only through this
 * injected interface — exactly the shape @edim/macro-dsl uses for DataProvider.
 * The real Claude-API client is injected by apps/web; tests inject a scripted,
 * deterministic client so the whole compile loop runs without a network.
 *
 * `complete` returns text or a transport-level failure string; it never throws
 * and it says nothing about whether the text is a *valid* macro — that is the
 * verifier's job downstream.
 */
export interface LLMRequest {
  readonly system: string;
  readonly user: string;
}

export type LLMResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly error: string };

export interface LLMClient {
  complete(req: LLMRequest): Promise<LLMResult>;
}

/**
 * Deterministic client for tests and the direct-input path: returns the scripted
 * responses in order, clamping to the last one once exhausted (so a single bad
 * response models "the model keeps making the same mistake"). An empty script
 * yields a transport failure.
 */
export class ScriptedLLMClient implements LLMClient {
  private index = 0;

  constructor(private readonly responses: readonly string[]) {}

  async complete(_req: LLMRequest): Promise<LLMResult> {
    if (this.responses.length === 0) {
      return { ok: false, error: "no scripted responses" };
    }
    const at = Math.min(this.index, this.responses.length - 1);
    this.index += 1;
    return { ok: true, text: this.responses[at]! };
  }

  /** Number of times complete() has been called — for asserting attempt counts. */
  get calls(): number {
    return this.index;
  }
}
