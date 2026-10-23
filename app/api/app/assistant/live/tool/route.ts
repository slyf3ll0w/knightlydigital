import { NextRequest, NextResponse } from "next/server";
import { reportError } from "@/lib/report-error";
import { getActor } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { mergeBulkProposals, toolsForActor, type ToolCtx } from "@/lib/assistant";

/**
 * One tool call from a live voice session. Gemini Live decides WHICH tool;
 * the tool itself runs here, under the signed-in user's permissions and
 * scopes exactly as in the chat (lib/assistant registry). Reads return
 * their data; actions return the staged card(s), which the drawer shows
 * and the user confirms (by voice for ordinary cards, by tap for money).
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await limit(`assistant-live-tool:${actor.id}`, 120, 10 * 60 * 1000)).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; args?: unknown };
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

  const ctx: ToolCtx = { proposals: [] };
  try {
    const result = await tool.run(actor, args, ctx);
    const proposals = mergeBulkProposals(ctx.proposals);
    return NextResponse.json({
      result,
      proposals,
      ...(ctx.nextStep ? { nextStep: ctx.nextStep } : {}),
      ...(ctx.navigate ? { navigate: ctx.navigate } : {}),
    });
  } catch (err) {
    reportError(`live tool ${name} failed`, err);
    return NextResponse.json({ result: { error: "The tool errored — apologize briefly and offer to try again." }, proposals: [] });
  }
}
