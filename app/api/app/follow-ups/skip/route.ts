import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { skipFollowUp } from "@/lib/follow-ups-server";

/**
 * POST { kind, id, mode } — the person's answer to an offered follow-up:
 * "later" hides it for a week, "never" for good, "undo" brings it back.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await req.json().catch(() => null);
  const kind = data?.kind === "invoice" ? "invoice" : data?.kind === "quote" ? "quote" : null;
  const id = typeof data?.id === "string" ? data.id.slice(0, 40) : "";
  const mode = data?.mode === "later" || data?.mode === "never" || data?.mode === "undo" ? data.mode : null;
  if (!kind || !id || !mode) return NextResponse.json({ error: "Which quote or invoice, and what to do with it?" }, { status: 400 });
  const ok = await skipFollowUp(actor, kind, id, mode);
  if (!ok) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
