import { prisma } from "./db";
import { aiChat, aiEnabled, extractJsonObject, type AIPart } from "./ai";
import { atlasAccess, ATLAS_ACCESS_SELECT, meterToClient, type AtlasAccess } from "./assistant-access";
import {
  centsToAtlasTokens,
  debitAtlasTokens,
  recordAssistantTurn,
  turnCostCents,
  type Debit,
  type TurnUsage,
} from "./assistant-billing";
import { limit } from "./rate-limit";
import type { Actor } from "./permissions";

/**
 * One metered Atlas call OUTSIDE the chat drawer — the estimate tools'
 * "describe the job, Atlas fills in the inputs" step, and anything similar
 * later. Same access gate, same meter, same ledger as a drawer turn
 * (app/api/app/assistant/route.ts), just no tool loop: one prompt in, one
 * answer out, priced from real usage and debited after the fact.
 */

const MODEL_DEFAULT = "gemini-2.5-flash";
const MODEL_FALLBACK = "gemini-flash-lite-latest";

export type OneShotResult =
  | { ok: true; text: string; atlasTokens: number; access: AtlasAccess }
  | { ok: false; status: number; error: string; access?: AtlasAccess; atlasLocked?: boolean };

function lockedMessage(access: Extract<AtlasAccess, { level: "locked" }>, name: string): string {
  const when = new Date(access.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return access.reason === "plan-spent"
    ? `${name} has used this period's tokens — the meter refills on ${when}.`
    : `${name} has used this month's free tokens — they refill on ${when}.`;
}

/** Post-debit access: the meter moved, so report the new truth. */
export function accessAfterDebit(before: AtlasAccess, debit: Debit | null): AtlasAccess {
  if (!debit) return before;
  const { level, balance } = debit;
  if (balance.remaining > 0) return { level, meter: meterToClient(balance) };
  return {
    level: "locked",
    reason: level === "plan" ? "plan-spent" : "free-spent",
    resetsAt: balance.refillsAt.toISOString(),
  };
}

export async function meteredOneShot(
  /** Who pays and who the ledger names — a signed-in user, or the company owner for a website photo fill-in. */
  actor: Pick<Actor, "id" | "companyId">,
  opts: {
    /** Ledger tag: what the tokens bought ("estimator"). */
    kind: string;
    system: string;
    prompt: string;
    maxOutputTokens?: number;
    temperature?: number;
    /**
     * How much the model may think before answering (tokens on 2.5, a level
     * on 3.x). Default 256 keeps fill-ins snappy; the tool BUILDER passes a
     * large budget — it's a one-time spend that decides how good the tool is.
     */
    thinkingBudget?: number;
    /** Request deadline — a big-thinking build may need more than the 60 s default. */
    timeoutMs?: number;
    /** Optional photo alongside the prompt (base64, no data: prefix). */
    image?: { base64: string; mime: string };
    /**
     * Cancel from the caller (an estimate-tool build the owner cancelled): the
     * request is dropped mid-flight. The provider returns no usage for a
     * dropped request, so nothing can be metered for it — only the calls
     * that completed before it are on the meter.
     */
    signal?: AbortSignal;
  }
): Promise<OneShotResult> {
  if (!aiEnabled()) return { ok: false, status: 503, error: "The assistant isn't available right now." };

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { ...ATLAS_ACCESS_SELECT, assistantName: true },
  });
  const access = company ? atlasAccess(company) : null;
  const name = company?.assistantName || "Atlas";
  if (!access || access.level === "off") {
    return { ok: false, status: 403, error: "The AI assistant isn't included on this account." };
  }
  if (access.level === "locked") {
    return { ok: false, status: 403, error: lockedMessage(access, name), access, atlasLocked: true };
  }

  // Cheaper than a drawer turn, so a looser burst — still a real spend per call
  const burst = await limit(`atlas-oneshot:${actor.companyId}`, 60, 10 * 60 * 1000);
  const userBurst = await limit(`atlas-oneshot-user:${actor.id}`, 30, 10 * 60 * 1000);
  if (!burst.ok || !userBurst.ok) {
    return { ok: false, status: 429, error: `${name} needs a breather — try again in a few minutes.` };
  }

  const metered = access.level === "free" || access.level === "plan";
  const usage: TurnUsage = { tokensIn: 0, tokensOut: 0, tokensCached: 0 };
  const onUsage = (u: TurnUsage) => {
    usage.tokensIn += u.tokensIn;
    usage.tokensOut += u.tokensOut;
    usage.tokensCached += u.tokensCached;
  };
  const userParts: AIPart[] = [{ text: opts.prompt }];
  // Gemini inline-image part — kept outside the chat-shaped AIPart union on purpose (history never carries images)
  if (opts.image) userParts.push({ inlineData: { mimeType: opts.image.mime, data: opts.image.base64 } } as unknown as AIPart);
  const contents = [{ role: "user" as const, parts: userParts }];
  const primary = process.env.AI_MODEL_ASSISTANT || MODEL_DEFAULT;
  let model = primary;
  let parts = await aiChat({
    contents,
    system: opts.system,
    model,
    temperature: opts.temperature ?? 0.2,
    maxOutputTokens: opts.maxOutputTokens ?? 1024,
    thinkingBudget: opts.thinkingBudget ?? 256,
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    companyId: actor.companyId,
    onUsage,
  });
  if (opts.signal?.aborted) return { ok: false, status: 499, error: "Cancelled.", access };
  if (!parts) {
    model = MODEL_FALLBACK;
    parts = await aiChat({
      contents,
      system: opts.system,
      model,
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 1024,
      ...(opts.thinkingBudget !== undefined ? { thinkingBudget: opts.thinkingBudget } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.signal ? { signal: opts.signal } : {}),
      companyId: actor.companyId,
      onUsage,
    });
    if (opts.signal?.aborted) return { ok: false, status: 499, error: "Cancelled.", access };
  }

  const costCents = turnCostCents(usage);
  const atlasTokens = metered ? centsToAtlasTokens(costCents) : 0;
  const debit = metered && atlasTokens > 0 ? await debitAtlasTokens(actor.companyId, atlasTokens) : null;
  recordAssistantTurn({
    companyId: actor.companyId,
    userId: actor.id,
    access: access.level,
    model,
    rounds: 1,
    toolCalls: 0,
    proposals: 0,
    usage,
    costCents,
    atlasTokens,
    ok: Boolean(parts),
    kind: opts.kind,
  });

  const text = (parts ?? [])
    .map((p) => ("text" in p && typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
  if (!parts || !text) {
    return {
      ok: false,
      status: 424,
      error: `${name} couldn't answer that just now — please try again.`,
      access: accessAfterDebit(access, debit),
    };
  }
  return { ok: true, text, atlasTokens, access: accessAfterDebit(access, debit) };
}

/** Parse the first JSON object out of a one-shot reply (models love prose around it). */
export function oneShotJson<T>(text: string): T | null {
  return extractJsonObject<T>(text);
}
