import { NextRequest, NextResponse } from "next/server";
import { limit } from "@/lib/rate-limit";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { companyTz } from "@/lib/tasks";
import { cancelScheduledSend, scheduleDocumentSend } from "@/lib/send-document";

/**
 * Send later for a quote. POST { date, time, email?, text? } (company-zone
 * wall clock) or { at: ISO } parks the draft to go out by itself; DELETE
 * cancels. The sweep (lib/send-document.ts runScheduledSends) does exactly
 * what the Send button does at that moment.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A scheduled send is a send — same per-company cap as the Send button
  const sendRl = await limit(`send:${actor.companyId}`, 120, 60 * 60 * 1000);
  if (!sendRl.ok) {
    return NextResponse.json(
      { error: "Too many sends in the last hour — try again shortly." },
      { status: 429, headers: { "Retry-After": String(sendRl.retryAfterSeconds) } }
    );
  }
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Sending quotes to clients"), { status: 403 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const out = await scheduleDocumentSend({
    kind: "quote",
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
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const out = await cancelScheduledSend({ kind: "quote", id, companyId: actor.companyId, scope: viaContactScope(actor) });
  return NextResponse.json(out.json, { status: out.status });
}
