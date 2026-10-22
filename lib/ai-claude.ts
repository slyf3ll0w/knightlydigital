import Anthropic from "@anthropic-ai/sdk";
import { reportError } from "@/lib/report-error";
import { currentUsageCompany, recordAiUsage } from "@/lib/usage";
import type { AIChatOptions, AIContent, AIPart } from "@/lib/ai";

/**
 * Claude as the Atlas chat model (2026-10-22). `aiChat` in lib/ai.ts routes
 * any `claude-*` model here; the rest of the app (one-shot drafting, call
 * notes, the estimator builder) stays on Gemini. The tool loop in
 * lib/assistant/index.ts is untouched: this file translates its
 * Gemini-shaped history (AIContent / AIPart) to Messages API blocks and the
 * reply back, so a provider switch is one Railway variable
 * (AI_MODEL_ASSISTANT=claude-haiku-5-5) and the Gemini fallback still works
 * mid-turn.
 *
 * Shapes that matter:
 * - tool_use ids: Claude pairs every tool_result with the tool_use id, so
 *   functionCall / functionResponse parts carry `id`. A functionCall made by
 *   Gemini earlier in the same turn has none — ids are then synthesized in
 *   order, which is what the API needs to match them.
 * - thinking: adaptive thinking is on by default on the 5.5 models and the
 *   thinking blocks of an assistant turn MUST be replayed when that turn is
 *   continued after tool results, so they ride along as `thinking` parts.
 *   Gemini never sees them (lib/ai.ts strips them).
 * - caching: tools + the stable half of the system prompt are the prefix;
 *   the breakpoint sits on the stable system block and the per-call half
 *   (date, clock, who's asking) comes after it, so one company's Atlas
 *   shares one cache across every turn of the hour.
 * - no temperature (non-default sampling is a 400 on the 5.5 models); depth
 *   comes from output_config.effort, derived from the caller's
 *   thinkingBudget so the Gemini knobs keep meaning something.
 */

export function claudeEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (!cached) cached = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  return cached;
}

/** thinkingBudget (a Gemini token budget) → Claude effort level. */
export function effortFor(thinkingBudget: number | undefined): "low" | "medium" | "high" {
  if (thinkingBudget === undefined) return "medium";
  if (thinkingBudget < 1024) return "low";
  if (thinkingBudget < 4096) return "medium";
  return "high";
}

/** OpenAPI-style Gemini declaration → Messages API tool. */
export function toClaudeTools(decls: NonNullable<AIChatOptions["tools"]>): Anthropic.Tool[] {
  return decls.map((d) => ({
    name: d.name,
    description: d.description,
    input_schema: (d.parameters ?? { type: "object", properties: {} }) as Anthropic.Tool.InputSchema,
  }));
}

/**
 * Gemini-shaped history → Messages API messages. Pure, exported for the
 * unit test. Empty text parts are dropped (the API rejects them), leading
 * assistant turns are dropped (the first message must be the user's), and
 * functionResponses without an id are paired, in order, with the tool_use
 * ids of the assistant message before them.
 */
export function toClaudeMessages(contents: AIContent[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let pendingIds: string[] = [];
  let synth = 0;
  for (const c of contents) {
    if (c.role === "model") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      const ids: string[] = [];
      for (const p of c.parts) {
        if ("thinking" in p) {
          if (p.redacted) blocks.push({ type: "redacted_thinking", data: p.signature });
          else blocks.push({ type: "thinking", thinking: p.thinking, signature: p.signature });
        } else if ("functionCall" in p) {
          const id = p.id ?? `toolu_wb_${++synth}`;
          ids.push(id);
          blocks.push({ type: "tool_use", id, name: p.functionCall.name, input: p.functionCall.args ?? {} });
        } else if ("text" in p && p.text.trim()) {
          blocks.push({ type: "text", text: p.text });
        }
      }
      if (blocks.length === 0) continue;
      if (out.length === 0) continue; // the first message must be the user's
      pendingIds = ids;
      out.push({ role: "assistant", content: blocks });
    } else {
      const blocks: Anthropic.ContentBlockParam[] = [];
      let take = 0;
      for (const p of c.parts) {
        if ("functionResponse" in p) {
          const id = p.id ?? pendingIds[take++];
          if (!id) continue; // a result with no call to answer — the API would 400
          blocks.push({ type: "tool_result", tool_use_id: id, content: JSON.stringify(p.functionResponse.response) });
        } else if ("text" in p && p.text.trim()) {
          blocks.push({ type: "text", text: p.text });
        }
      }
      if (blocks.length === 0) continue;
      pendingIds = [];
      out.push({ role: "user", content: blocks });
    }
  }
  return out;
}

/** Messages API reply → the parts the Atlas loop understands. Pure. */
export function fromClaudeContent(content: Anthropic.ContentBlock[]): AIPart[] {
  const parts: AIPart[] = [];
  for (const b of content) {
    if (b.type === "thinking") parts.push({ thinking: b.thinking, signature: b.signature });
    else if (b.type === "redacted_thinking") parts.push({ thinking: "", signature: b.data, redacted: true });
    else if (b.type === "text") parts.push({ text: b.text });
    else if (b.type === "tool_use") {
      parts.push({ functionCall: { name: b.name, args: (b.input ?? {}) as Record<string, unknown> }, id: b.id });
    }
  }
  return parts;
}

/** One Claude turn, same contract as aiChat: parts, or null on failure. */
export async function aiChatClaude(opts: AIChatOptions, model: string): Promise<AIPart[] | null> {
  if (!claudeEnabled()) {
    reportError("aiChatClaude: ANTHROPIC_API_KEY unset — falling back", model);
    return null;
  }
  const system: Anthropic.TextBlockParam[] = [];
  if (opts.system) system.push({ type: "text", text: opts.system, cache_control: { type: "ephemeral" } });
  if (opts.systemVolatile) system.push({ type: "text", text: opts.systemVolatile });
  const messages = toClaudeMessages(opts.contents);
  if (messages.length === 0) return null;
  const tools = opts.tools && opts.tools.length > 0 ? toClaudeTools(opts.tools) : undefined;

  try {
    const res = await client().messages.create(
      {
        model,
        max_tokens: opts.maxOutputTokens ?? 1024,
        ...(system.length > 0 ? { system } : {}),
        ...(tools ? { tools } : {}),
        thinking: { type: "adaptive" },
        output_config: { effort: effortFor(opts.thinkingBudget) },
        messages,
      },
      {
        timeout: opts.timeoutMs ?? 120_000,
        ...(opts.signal ? { signal: opts.signal } : {}),
      }
    );
    const u = res.usage;
    const usage = {
      tokensIn: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      tokensOut: u.output_tokens,
      tokensCached: u.cache_read_input_tokens ?? 0,
    };
    recordAiUsage(opts.companyId ?? currentUsageCompany(), usage);
    opts.onUsage?.(usage);
    if (res.stop_reason === "max_tokens") {
      reportError("aiChatClaude: hit max_tokens — trailing tool calls may be missing", model);
    } else if (res.stop_reason === "refusal") {
      reportError("aiChatClaude: refusal", model, res.stop_details?.category ?? null);
    }
    return fromClaudeContent(res.content);
  } catch (err) {
    if (opts.signal?.aborted) return null; // cancelled by the caller — not an error
    if (err instanceof Anthropic.RateLimitError) {
      reportError("aiChatClaude: rate limited — falling back", model);
    } else if (err instanceof Anthropic.APIConnectionError) {
      reportError("aiChatClaude: connection failed — falling back", model, err.message);
    } else if (err instanceof Anthropic.APIError) {
      reportError("aiChatClaude: API error", model, err.status, err.message.slice(0, 500));
    } else {
      reportError("aiChatClaude: request failed", err);
    }
    return null;
  }
}
