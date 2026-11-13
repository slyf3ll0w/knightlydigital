import Anthropic from "@anthropic-ai/sdk";
import { reportError } from "@/lib/report-error";
import { currentUsageCompany, recordAiUsage } from "@/lib/usage";
import { CLAUDE_DEFAULT_MODEL, type AIChatOptions, type AIContent, type AIPart, type AskAIOptions } from "@/lib/ai";

/**
 * Claude behind lib/ai.ts (2026-10-22 for Atlas chat; 2026-11-05 for every
 * text feature). `aiChat` and `askAI` route any `claude-*` model here; Gemini
 * stays the engine for speech (Live voice, speak, audio transcription) and
 * the fallback when a Claude call fails. The tool loop in
 * lib/assistant/index.ts is untouched: this file translates its
 * Gemini-shaped history (AIContent / AIPart) to Messages API blocks and the
 * reply back, so a provider switch is one Railway variable and the Gemini
 * fallback still works mid-turn.
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
 * - tool_choice "none" for the forced last round: the history is full of
 *   tool calls, so the definitions must stay declared, but the model has to
 *   answer in text.
 * - images: a user turn's inlineData part (the estimator photo fill-in)
 *   becomes an image block; Claude takes jpeg/png/gif/webp only.
 * - search: askAI's `useSearch` (Google grounding on Gemini) becomes the
 *   web_search server tool — the model searches and cites on its own.
 *
 * Key scope: a key made at the organization level (outside a workspace) is
 * rejected with "not scoped to a workspace"; make the key inside a workspace,
 * or set ANTHROPIC_WORKSPACE_ID and the header goes on every request.
 */

export function claudeEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Second Claude model when the first fails and there is no Gemini key to fall back to. */
export const CLAUDE_FALLBACK_MODEL = "claude-sonnet-5-5";

let cached: { client: Anthropic; sig: string } | null = null;
function client(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY ?? "";
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const sig = `${key}|${workspace ?? ""}`;
  if (!cached || cached.sig !== sig) {
    cached = {
      sig,
      client: new Anthropic({
        apiKey: key,
        maxRetries: 1,
        ...(workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {}),
      }),
    };
  }
  return cached.client;
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

type ImageMime = Anthropic.Base64ImageSource["media_type"];
const IMAGE_MIMES: ReadonlySet<string> = new Set<ImageMime>(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** An inline image as a Messages API block, or null when Claude can't take that type. Pure. */
export function imageBlock(mimeType: string, data: string): Anthropic.ImageBlockParam | null {
  const mime = mimeType.trim().toLowerCase();
  const normalized = mime === "image/jpg" ? "image/jpeg" : mime;
  if (!IMAGE_MIMES.has(normalized)) return null;
  return { type: "image", source: { type: "base64", media_type: normalized as ImageMime, data } };
}

/**
 * Gemini-shaped history → Messages API messages. Pure, exported for the
 * unit test. Empty text parts are dropped (the API rejects them), leading
 * assistant turns are dropped (the first message must be the user's), and
 * functionResponses without an id are paired, in order, with the tool_use
 * ids of the assistant message before them. An inlineData part on a user
 * turn becomes an image block; a type Claude can't take is left out.
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
        } else if ("inlineData" in p) {
          const img = imageBlock(p.inlineData.mimeType, p.inlineData.data);
          if (img) blocks.push(img);
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

/** The request one chat turn sends — pure, exported for the unit test. Null when there is nothing to send. */
export function claudeChatParams(opts: AIChatOptions, model: string): Anthropic.MessageCreateParamsNonStreaming | null {
  const system: Anthropic.TextBlockParam[] = [];
  if (opts.system) system.push({ type: "text", text: opts.system, cache_control: { type: "ephemeral" } });
  if (opts.systemVolatile) system.push({ type: "text", text: opts.systemVolatile });
  const messages = toClaudeMessages(opts.contents);
  if (messages.length === 0) return null;
  const tools = opts.tools && opts.tools.length > 0 ? toClaudeTools(opts.tools) : undefined;
  return {
    model,
    max_tokens: opts.maxOutputTokens ?? 1024,
    ...(system.length > 0 ? { system } : {}),
    ...(tools ? { tools } : {}),
    ...(tools && opts.toolChoice === "none" ? { tool_choice: { type: "none" } } : {}),
    thinking: { type: "adaptive" },
    output_config: { effort: effortFor(opts.thinkingBudget) },
    messages,
  };
}

function usageOf(u: Anthropic.Usage) {
  return {
    tokensIn: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    tokensOut: u.output_tokens,
    tokensCached: u.cache_read_input_tokens ?? 0,
  };
}

function reportFailure(where: string, model: string, err: unknown) {
  if (err instanceof Anthropic.RateLimitError) {
    reportError(`${where}: rate limited — falling back`, model);
  } else if (err instanceof Anthropic.APIConnectionError) {
    reportError(`${where}: connection failed — falling back`, model, err.message);
  } else if (err instanceof Anthropic.APIError) {
    reportError(`${where}: API error`, model, err.status, err.message.slice(0, 500));
  } else {
    reportError(`${where}: request failed`, err);
  }
}

/** Above this answer budget a turn is streamed (the SDKs want streaming for long generations). */
const STREAM_OVER_TOKENS = 16_000;

/** One Claude turn, same contract as aiChat: parts, or null on failure. */
export async function aiChatClaude(opts: AIChatOptions, model: string): Promise<AIPart[] | null> {
  if (!claudeEnabled()) {
    reportError("aiChatClaude: ANTHROPIC_API_KEY unset — falling back", model);
    return null;
  }
  const params = claudeChatParams(opts, model);
  if (!params) return null;

  try {
    const request = {
      timeout: opts.timeoutMs ?? 120_000,
      ...(opts.signal ? { signal: opts.signal } : {}),
    };
    // A big answer budget (the estimate-tool builder) takes minutes to fill:
    // stream it so the connection is never idle, and collect the same Message.
    const res =
      params.max_tokens > STREAM_OVER_TOKENS
        ? await client().messages.stream(params, request).finalMessage()
        : await client().messages.create(params, request);
    const usage = usageOf(res.usage);
    recordAiUsage(opts.companyId ?? currentUsageCompany(), usage);
    opts.onUsage?.(usage);
    if (res.stop_reason === "max_tokens") {
      // max_tokens covers thinking AND the answer — a turn that thought to the cap comes back with no text at all
      reportError("aiChatClaude: hit max_tokens — the answer is cut short or missing", model, `max_tokens ${params.max_tokens}`, `output ${res.usage.output_tokens}`);
    } else if (res.stop_reason === "refusal") {
      reportError("aiChatClaude: refusal", model, res.stop_details?.category ?? null);
    }
    return fromClaudeContent(res.content);
  } catch (err) {
    if (opts.signal?.aborted) return null; // cancelled by the caller — not an error
    reportFailure("aiChatClaude", model, err);
    return null;
  }
}

// ── One-shot completions (askAI) ─────────────────────────────────────────────

/** Stands in for Gemini's JSON response mode — the 5.5 models follow it; askAIJson still parses defensively. */
export const JSON_ONLY_RULE =
  "Reply with ONLY one JSON object — no words before or after it, no code fences.";

/**
 * The request one askAI call sends — pure, exported for the unit test. Null
 * when Claude can't take the input (audio, or an image type it doesn't
 * accept), so lib/ai.ts hands the call to Gemini instead.
 */
export function claudeAskParams(opts: AskAIOptions, model: string): Anthropic.MessageCreateParamsNonStreaming | null {
  if (opts.audioBase64 && opts.audioMime) return null; // Claude has no audio input
  const content: Anthropic.ContentBlockParam[] = [];
  if (opts.imageBase64 && opts.imageMime) {
    const img = imageBlock(opts.imageMime, opts.imageBase64);
    if (!img) return null;
    content.push(img);
  }
  content.push({ type: "text", text: opts.prompt });
  const system = [opts.system, opts.json ? JSON_ONLY_RULE : ""].filter(Boolean).join("\n\n");
  return {
    model,
    max_tokens: opts.maxOutputTokens ?? 8192,
    ...(system ? { system } : {}),
    // Google-grounded lookups become the web_search server tool: the model
    // runs the searches itself and answers from the pages it read.
    ...(opts.useSearch ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] } : {}),
    thinking: { type: "adaptive" },
    // Drafting work: the lightest reasoning, the fastest answer. Atlas chat
    // has its own ladder (effortFor).
    output_config: { effort: "low" },
    messages: [{ role: "user", content }],
  };
}

/** One completion on Claude, same contract as askAI: the text, or null on failure (the caller falls back). */
export async function askAIClaude(opts: AskAIOptions, model: string = CLAUDE_DEFAULT_MODEL): Promise<string | null> {
  if (!claudeEnabled()) return null;
  const params = claudeAskParams(opts, model);
  if (!params) return null;
  try {
    // grounded calls run real web searches — give them longer
    const res = await client().messages.create(params, { timeout: opts.useSearch ? 100_000 : 60_000 });
    const usage = usageOf(res.usage);
    recordAiUsage(opts.companyId ?? currentUsageCompany(), usage);
    opts.onUsage?.(usage);
    if (res.stop_reason === "refusal") {
      reportError("askAIClaude: refusal", model, res.stop_details?.category ?? null);
    } else if (res.stop_reason === "max_tokens") {
      reportError("askAIClaude: hit max_tokens — answer may be cut short", model);
    }
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return text || null;
  } catch (err) {
    reportFailure("askAIClaude", model, err);
    return null;
  }
}
