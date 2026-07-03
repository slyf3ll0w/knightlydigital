import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { aiEnabled } from "@/lib/ai";
import { limit } from "@/lib/rate-limit";
import { runAssistant, type ChatMessage } from "@/lib/assistant";

/**
 * POST — one assistant turn (docs/plans/ai-assistant-plan.md). Read-only:
 * the tool loop in lib/assistant.ts has no write tools. History lives in the
 * client (sessionStorage); nothing is persisted here.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!aiEnabled()) {
    return NextResponse.json({ error: "The assistant isn't available right now." }, { status: 503 });
  }

  // burst + daily caps per company — every turn is a real AI spend
  const burst = limit(`assistant:${actor.companyId}`, 20, 10 * 60 * 1000);
  const daily = limit(`assistant-day:${actor.companyId}`, 200, 24 * 60 * 60 * 1000);
  if (!burst.ok || !daily.ok) {
    return NextResponse.json(
      { error: "The assistant needs a breather — try again in a few minutes." },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { messages?: unknown };
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

  const result = await runAssistant(actor, messages);
  if (!result) {
    return NextResponse.json(
      { error: "The assistant couldn't answer that just now — please try again." },
      { status: 502 }
    );
  }
  return NextResponse.json({ reply: result.reply, proposals: result.proposals });
}
