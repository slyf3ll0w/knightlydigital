import { NextRequest, NextResponse } from "next/server";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { companyTz } from "@/lib/tasks";
import { cancelScheduledSend, scheduleDocumentSend } from "@/lib/send-document";

/**
 * Send later for an invoice. POST { date, time, email?, text? } (company-zone
 * wall clock) or { at: ISO } parks the draft to go out by itself; DELETE
 * cancels. The sweep (lib/send-document.ts runScheduledSends) does exactly
 * what the Send button does at that moment.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Sending invoices to clients"), { status: 403 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const out = await scheduleDocumentSend({
    kind: "invoice",
    id,
    companyId: actor.companyId,
    scope: viaContactScope(actor),
    actorId: actor.id,
    body,
    tz: await companyTz(actor.companyId),
  });
  return NextResponse.json(out.json, { status: out.status });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const out = await cancelScheduledSend({ kind: "invoice", id, companyId: actor.companyId, scope: viaContactScope(actor) });
  return NextResponse.json(out.json, { status: out.status });
}
