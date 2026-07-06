/**
 * @edim/macro-compile — Part① STEP 4: A4 natural language → Macro DSL (first AI).
 *
 * Dependency rule (non-negotiable): imports NOTHING from higher layers and NO
 * network. Only @edim/core-ontology, @edim/macro-dsl and @edim/macro-verify. The
 * LLM is reached solely through the injected LLMClient; the real Claude-API
 * client lives in apps/web.
 *
 * First principle: "the LLM is a compiler." The model only *proposes* a DSL
 * formula; compile() runs it through parse + static verify and returns it as
 * `verified` only when it holds. Raw model output is never executed here.
 *
 * Public surface:
 *   compile(request, ctx, client, opts?) → Promise<CompileResult>
 *   LLMClient / LLMRequest / LLMResult     (the injected boundary)
 *   ScriptedLLMClient                      (deterministic client for tests)
 *   SYSTEM_PROMPT / buildUserPrompt / buildRetryPrompt
 */
export const MACRO_COMPILE_PACKAGE = "@edim/macro-compile" as const;
export const COMPILE_VERSION = "1.0" as const;

export { compile } from "./compile";
export type { CompileOptions, CompileResult } from "./compile";
export { ScriptedLLMClient } from "./client";
export type { LLMClient, LLMRequest, LLMResult } from "./client";
export { SYSTEM_PROMPT, buildUserPrompt, buildRetryPrompt } from "./prompt";
