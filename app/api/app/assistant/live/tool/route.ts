import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { ATLAS_ACCESS_SELECT, atlasAccess } from "@/lib/assistant-access";
import { centsToAtlasTokens, debitAtlasTokens, recordAssistantTurn, turnCostCents, type TurnUsage } from "@/lib/assistant-billing";
import { mergeBulkProposals, toolsForActor, type Proposal, type ToolCtx } from "@/lib/assistant";

/**
 * One tool call from a live voice session. Gemini Live decides WHICH tool;
 * the tool itself runs here, under the signed-in user's permissions and
 * scopes exactly as in the chat (lib/assistant registry). Reads return
 * their data; actions return the staged card(s), which the drawer shows
 * and the user confirms (by voice for ordinary cards, by tap for money).
 *
 * Same door as the chat and the token route (2026-11-02): an account where
 * Atlas is off or out of tokens gets a 403 here too — the token only
 * proves the session started. A tool that calls a model of its own (a
 * grounded part-price lookup) folds that usage into the meter the way a
 * chat turn does, as an AssistantTurn of kind "live-tool".
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [company, burst] = await Promise.all([
    prisma.company.findUnique({ where: { id: actor.companyId }, select: ATLAS_ACCESS_SELECT }),
    limit(`assistant-live-tool:${actor.id}`, 120, 10 * 60 * 1000),
  ]);
  const access = company ? atlasAccess(company) : null;
  if (!access || access.level === "off") return NextResponse.json({ error: "The AI assistant isn't included on this account." }, { status: 403 });
  if (access.level === "locked") return NextResponse.json({ error: "Atlas is out of tokens for now." }, { status: 403 });
  if (!burst.ok) return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const metered = access.level === "free" || access.level === "plan";

  const body = (await req.json().catch(() => ({}))) as { name?: unknown; args?: unknown; callId?: unknown };
  const name = typeof body.name === "string" ? body.name : "";
  const args = body.args && typeof body.args === "object" && !Array.isArray(body.args) ? (body.args as Record<string, unknown>) : {};
  // Not offered to live sessions (each call here is its own turn, so "stage
  // first, then queue" can never be satisfied) — but if the model reaches
  // for it anyway, steer instead of erroring in a loop.
  if (name === "queue_next_step") {
    return NextResponse.json({
      result: { note: "There is no queue in a live conversation — you are here the whole time. Do the next step yourself now: stage it, and if the user already told you to do it, call confirm_cards." },
      proposals: [],
    });
  }
  const tool = toolsForActor(actor).find((t) => t.decl.name === name);
  if (!tool) return NextResponse.json({ result: { error: `Unknown tool ${name}` }, proposals: [] });

  const usage: TurnUsage = { tokensIn: 0, tokensOut: 0, tokensCached: 0 };
  const ctx: ToolCtx = {
    proposals: [],
    addUsage: (u) => {
      usage.tokensIn += u.tokensIn;
      usage.tokensOut += u.tokensOut;
      usage.tokensCached += u.tokensCached;
    },
  };
  let proposals: Proposal[] = [];
  let ok = true;
  let result: Record<string, unknown>;
  try {
    result = await tool.run(actor, args, ctx);
    proposals = withCallId(mergeBulkProposals(ctx.proposals), body.callId);
  } catch (err) {
    ok = false;
    reportError(`live tool ${name} failed`, err);
    result = { error: "The tool errored — apologize briefly and offer to try again." };
  }
  if (usage.tokensIn + usage.tokensOut + usage.tokensCached > 0) {
    const costCents = turnCostCents(usage);
    const atlasTokens = metered ? centsToAtlasTokens(costCents) : 0;
    if (atlasTokens > 0) await debitAtlasTokens(actor.companyId, atlasTokens).catch((e) => reportError("live tool: debit failed", e));
    recordAssistantTurn({
      companyId: actor.companyId,
      userId: actor.id,
      access: access.level as "free" | "plan" | "full",
      model: `tool:${name}`,
      rounds: 0,
      toolCalls: 1,
      proposals: proposals.length,
      usage,
      costCents,
      atlasTokens,
      ok,
      kind: "live-tool",
    });
  }
  return NextResponse.json({
    result,
    proposals,
    ...(ok && ctx.nextStep ? { nextStep: ctx.nextStep } : {}),
    ...(ok && ctx.navigate ? { navigate: ctx.navigate } : {}),
  });
}

/**
 * Every live tool call runs in its own ctx, so `stage` numbers every card
 * from 1 — three "email_client" cards in one conversation all came back as
 * `p1-email_client` and the drawer treated them as one (a Confirm settled
 * them all, the duplicate guard answered about the wrong one, React keys
 * collided; 2026-11-02). The browser sends a per-session call counter and
 * it is folded into the id; a request without one gets a random tag. The
 * chat route (text mode) is untouched and keeps `p1-<kind>`.
 */
function withCallId(proposals: Proposal[], callId: unknown): Proposal[] {
  const tag = typeof callId === "string" && /^[a-z0-9_-]{1,32}$/i.test(callId) ? callId : Math.random().toString(36).slice(2, 8);
  return proposals.map((p) => ({ ...p, id: `${p.id}~${tag}` }));
}
