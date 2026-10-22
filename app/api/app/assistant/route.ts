import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { aiEnabled } from "@/lib/ai";
import { limit } from "@/lib/rate-limit";
import { runAssistant, type ChatMessage } from "@/lib/assistant";
import { describeToolCalls } from "@/lib/assistant/progress";
import {
  atlasAccess,
  ATLAS_ACCESS_SELECT,
  meterToClient,
  type AtlasAccess,
} from "@/lib/assistant-access";
import {
  centsToAtlasTokens,
  debitAtlasTokens,
  recordAssistantTurn,
  turnCostCents,
  type Debit,
  type TurnUsage,
} from "@/lib/assistant-billing";
import { inPreview, previewBlockedError } from "@/lib/preview";

/**
 * POST — one assistant turn (docs/plans/ai-assistant-plan.md). The tool
 * loop in lib/assistant stages proposals; nothing is written here. History
 * lives in the client (sessionStorage).
 *
 * Metering (lib/assistant-access.ts + lib/assistant-billing.ts): the free
 * tier and the plan share one meter. The turn's real cost, priced from Gemini
 * usage and converted to Atlas tokens, is debited AFTER the call — a turn
 * is allowed while any tokens remain, so a meter can overshoot by at most
 * one turn (a few cents), cheaper than reserving and truer than guessing.
 * Whitelisted ("full") accounts are unmetered but still logged. Every turn
 * lands in AssistantTurn either way, including failed ones.
 */

function lockedMessage(access: Extract<AtlasAccess, { level: "locked" }>, name = "Atlas"): string {
  const when = new Date(access.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return access.reason === "plan-spent"
    ? `${name} has used this period's tokens — the meter refills on ${when}.`
    : `${name} has used this month's free tokens — they refill on ${when}.`;
}

/** Post-debit access for the drawer: the meter moved, so send the new truth. */
function accessAfter(before: AtlasAccess, debit: Debit | null): AtlasAccess {
  if (!debit) return before;
  const { level, balance } = debit;
  if (balance.remaining > 0) return { level, meter: meterToClient(balance) };
  return {
    level: "locked",
    reason: level === "plan" ? "plan-spent" : "free-spent",
    resetsAt: balance.refillsAt.toISOString(),
  };
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!aiEnabled()) {
    return NextResponse.json({ error: "The assistant isn't available right now." }, { status: 503 });
  }

  // The gate checks are independent reads — one round trip, not six in a
  // row, before the model is even asked (every one of them sat in front of
  // the user's wait).
  const [preview, company, burst, daily, userBurst, userDaily] = await Promise.all([
    inPreview(actor.companyId),
    // Account-level access: the layout also gates the UI, but this is the
    // enforcement point a direct request can't skip.
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ...ATLAS_ACCESS_SELECT, assistantName: true },
    }),
    // burst + daily caps per company — every turn is a real AI spend — plus a
    // per-user ceiling at half the company quota so one user can't exhaust it
    limit(`assistant:${actor.companyId}`, 20, 10 * 60 * 1000),
    limit(`assistant-day:${actor.companyId}`, 200, 24 * 60 * 60 * 1000),
    limit(`assistant-user:${actor.id}`, 10, 10 * 60 * 1000),
    limit(`assistant-user-day:${actor.id}`, 100, 24 * 60 * 60 * 1000),
  ]);
  if (preview) return NextResponse.json(previewBlockedError("Atlas, your AI assistant,"), { status: 403 });

  const access = company ? atlasAccess(company) : null;
  const name = company?.assistantName || "Atlas";
  if (!access || access.level === "off") {
    return NextResponse.json(
      { error: "The AI assistant isn't included on this account." },
      { status: 403 }
    );
  }
  if (access.level === "locked") {
    return NextResponse.json(
      { error: lockedMessage(access, name), atlasLocked: true, access },
      { status: 403 }
    );
  }

  if (!burst.ok || !daily.ok || !userBurst.ok || !userDaily.ok) {
    return NextResponse.json(
      { error: "The assistant needs a breather — try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: unknown; voice?: unknown };
  const voice = body.voice === true;
  const raw = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
  const messages: ChatMessage[] = raw
    .map((m) => {
      const r = (m ?? {}) as Record<string, unknown>;
      return {
        role: r.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: typeof r.content === "string" ? r.content.slice(0, 4000) : "",
      };
    })
    .filter((m) => m.content.trim());
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Send at least one user message." }, { status: 400 });
  }

  const metered = access.level === "free" || access.level === "plan";

  /** Price + ledger + (metered) debit for one turn's usage. */
  async function settle(
    usage: TurnUsage,
    meta: { rounds: number; toolCalls: number; proposals: number; model: string; ok: boolean }
  ): Promise<{ atlasTokens: number; debit: Debit | null }> {
    const costCents = turnCostCents(usage);
    const atlasTokens = metered ? centsToAtlasTokens(costCents) : 0;
    const debit = metered && atlasTokens > 0 ? await debitAtlasTokens(actor!.companyId, atlasTokens) : null;
    recordAssistantTurn({
      companyId: actor!.companyId,
      userId: actor!.id,
      access: access!.level as "free" | "plan" | "full",
      model: meta.model,
      rounds: meta.rounds,
      toolCalls: meta.toolCalls,
      proposals: meta.proposals,
      usage,
      costCents,
      atlasTokens,
      ok: meta.ok,
    });
    return { atlasTokens, debit };
  }

  /** The whole turn: model loop, metering, and the final payload. */
  async function turn(onProgress?: (text: string) => void): Promise<{ status: number; body: Record<string, unknown> }> {
    const result = await runAssistant(actor!, messages, {
      voice,
      onFailure: (partial) => {
        // burned tokens are still spend — meter them, then let the caller retry
        void settle(partial.usage, { ...partial, proposals: 0, ok: false });
      },
      onProgress: onProgress ? (p) => onProgress(describeToolCalls(p.tools)) : undefined,
    });
    if (!result) {
      return {
        status: 424,
        body: { error: "The assistant couldn't answer that just now — please try again." },
      };
    }

    const { atlasTokens, debit } = await settle(result.usage, {
      rounds: result.rounds,
      toolCalls: result.toolCalls,
      proposals: result.proposals.length,
      model: result.model,
      ok: true,
    });

    return {
      status: 200,
      body: {
        reply: result.reply,
        proposals: result.proposals,
        ...(result.nextStep ? { nextStep: result.nextStep } : {}),
        ...(result.navigate ? { navigate: result.navigate } : {}),
        access: accessAfter(access!, debit),
        turnTokens: atlasTokens,
      },
    };
  }

  // The drawer asks for NDJSON: one {type:"progress", text} line as each
  // tool round starts, then {type:"done", ...payload} or {type:"error",
  // status, error}. A ten-second turn that names its steps reads as work;
  // the same wait on a blank spinner reads as a hang. Other callers (scripts,
  // Siri) get the plain JSON they always did.
  if (req.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (o: Record<string, unknown>) => {
          try {
            controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
          } catch {
            /* client went away mid-turn — the turn still settles below */
          }
        };
        try {
          const out = await turn((text) => send({ type: "progress", text }));
          send(out.status === 200 ? { type: "done", ...out.body } : { type: "error", status: out.status, ...out.body });
        } catch (err) {
          reportError("[assistant] stream turn failed", err);
          send({ type: "error", status: 500, error: "The assistant couldn't answer that just now — please try again." });
        }
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      },
    });
    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
        // Railway's proxy would otherwise hold the body until the turn ends
        "X-Accel-Buffering": "no",
      },
    });
  }

  const out = await turn();
  return NextResponse.json(out.body, { status: out.status });
}
