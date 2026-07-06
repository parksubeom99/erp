import { compile } from "@edim/macro-compile";
import type { CompileResult, LLMClient, LLMRequest, LLMResult } from "@edim/macro-compile";
import { getServerSession } from "../session";
import { getTreeForSession } from "../hierarchy";

/**
 * STEP 4 adapter — the ONLY layer that binds the pure @edim/macro-compile loop
 * to a real LLM and the RLS-scoped Hierarchy tree.
 *
 * @edim/macro-compile stays pure (no network); this seam holds the API key and
 * the network call. Model + key come from env so no model id is hard-coded
 * (owner decision: hybrid-B launch on Claude Sonnet, env-swappable). The tree is
 * injected from the session so the verifier can check edim:// addresses; the URI
 * tenant is checked against the session tenant, failing closed.
 *
 * Returns null when unauthenticated; otherwise a CompileResult whose `verified`
 * flag a downstream approval step (STEP 5) must gate on — an unverified macro is
 * returned transparently but must never be auto-approved.
 */
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const MODEL = process.env.EDIM_MACRO_MODEL ?? "claude-sonnet-5";

class ClaudeClient implements LLMClient {
  async complete(req: LLMRequest): Promise<LLMResult> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
    try {
      const res = await fetch(ANTHROPIC_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 512,
          temperature: 0,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
        }),
      });
      if (!res.ok) return { ok: false, error: `Anthropic API ${res.status}` };
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((block) => block.type === "text")?.text;
      return text ? { ok: true, text } : { ok: false, error: "empty completion" };
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : "fetch failed" };
    }
  }
}

export async function compileMacroForSession(request: string): Promise<CompileResult | null> {
  const session = await getServerSession();
  if (!session) return null;
  const tree = await getTreeForSession();
  if (!tree) return null;
  return compile(request, { tree, tenantId: session.tenantId }, new ClaudeClient());
}
