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
