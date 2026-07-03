/**
 * Minimal Gemini REST wrapper — the AI counterpart to lib/email.ts's
 * sendEmail(): one fetch, env-gated, no SDK. No GEMINI_API_KEY means AI
 * features quietly report themselves unavailable (aiEnabled() gates UI).
 *
 * Model comes from AI_MODEL so upgrading is a Railway variable change, not a
 * deploy. Default is the cheapest tier — fine for structured drafting work.
 *
 * Privacy note: callers must only send business facts (trade, city, service
 * names/prices). Never client data or PII — the free Gemini tier may use
 * inputs for training.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.1-flash-lite";

export function aiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export type AskAIOptions = {
  prompt: string;
  /** Steers tone/role; sent as systemInstruction. */
  system?: string;
  /** Ask for a JSON object back (responseMimeType: application/json). */
  json?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
};

/**
 * One completion. Returns the model's text, or null when AI is unconfigured
 * or the call fails (callers fall back to deterministic behavior — same
 * contract as sendEmail(): failure is soft, never a thrown 500).
 */
export async function askAI(opts: AskAIOptions): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.AI_MODEL || DEFAULT_MODEL;

  const body = {
    contents: [{ parts: [{ text: opts.prompt }] }],
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  try {
    const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.error("askAI: Gemini error", res.status, (await res.text()).slice(0, 500));
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return text || null;
  } catch (err) {
    console.error("askAI: request failed", err);
    return null;
  }
}

/**
 * JSON-mode completion parsed into an object. One retry on unparseable
 * output, then null (caller falls back).
 */
export async function askAIJson<T>(opts: Omit<AskAIOptions, "json">): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await askAI({ ...opts, json: true });
    if (text === null) return null; // unconfigured or transport failure — retry won't help
    try {
      return JSON.parse(text) as T;
    } catch {
      console.error("askAIJson: unparseable response", text.slice(0, 300));
    }
  }
  return null;
}

// ── Multi-turn chat with function calling (owner assistant) ─────────────────

export type AIPart =
  | { text: string }
  // thoughtSignature: Gemini 3.x models require one on functionCall parts in
  // history; models pass their own through, and callers replaying calls made
  // by a DIFFERENT model must supply the documented sentinel value.
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

/** Sentinel accepted by Gemini 3.x for manually-constructed function calls. */
export const AI_THOUGHT_SIGNATURE_SENTINEL = "context_engineering_is_the_way_to_go";

export type AIContent = { role: "user" | "model"; parts: AIPart[] };

/** Gemini function declaration — parameters is an OpenAPI-style schema. */
export type AIFunctionDecl = {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
};

export type AIChatOptions = {
  system?: string;
  contents: AIContent[];
  tools?: AIFunctionDecl[];
  model?: string; // overrides AI_MODEL for this call
  maxOutputTokens?: number;
  temperature?: number;
  /** Gemini 2.5 models "think" by default, adding seconds per call — pass 0
   *  for latency-sensitive chat. Ignored on models that don't support it. */
  thinkingBudget?: number;
};

/**
 * One model turn of a chat. Returns the candidate's parts — the caller
 * inspects them for functionCall parts, executes tools, appends
 * functionResponse contents, and calls again. Null on unconfigured/failure.
 */
export async function aiChat(opts: AIChatOptions): Promise<AIPart[] | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = opts.model || process.env.AI_MODEL || DEFAULT_MODEL;

  const body = {
    contents: opts.contents,
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    ...(opts.tools && opts.tools.length > 0
      ? { tools: [{ functionDeclarations: opts.tools }] }
      : {}),
    generationConfig: {
      temperature: opts.temperature ?? 0.3,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      // thinkingConfig is only valid on 2.5-generation models
      ...(opts.thinkingBudget !== undefined && /^gemini-2\.5/.test(model)
        ? { thinkingConfig: { thinkingBudget: opts.thinkingBudget } }
        : {}),
    },
  };

  // 429 (per-model quota) returns null IMMEDIATELY — callers fall back to a
  // different model, whose quota bucket is separate. Waiting here just
  // stalls the user. 503 (overload) gets one quick retry.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 503 && attempt === 0) {
        console.error("aiChat: Gemini 503 — quick retry");
        await new Promise((r) => setTimeout(r, 2_000));
        continue;
      }
      if (!res.ok) {
        console.error("aiChat: Gemini error", model, res.status, (await res.text()).slice(0, 300));
        return null;
      }
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: AIPart[] } }[];
      };
      return data.candidates?.[0]?.content?.parts ?? null;
    } catch (err) {
      console.error("aiChat: request failed", err);
      return null;
    }
  }
  return null;
}
