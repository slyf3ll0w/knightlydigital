import { NextRequest, NextResponse } from "next/server";
import { getActor, jobScope } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { sendChannelsFrom } from "@/lib/send-channels";
import { saveReportNote, sendJobReport } from "@/lib/job-report";

/**
 * The work completed report (Gallery plan, phase B).
 *
 *   PATCH { note }                      save the note printed on the report ("" clears)
 *   POST  { email?, text?, note? }      send the client the link (email and/or text), stamp reportSentAt
 *
 * Anyone who can see the job may write the note and send the report (a
 * tech wrapping up in the driveway is the point); sales never work jobs.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { note?: unknown };
  if (typeof body.note !== "string") return NextResponse.json({ error: "Say what the note should be." }, { status: 400 });
  const result = await saveReportNote(actor.companyId, { id, companyId: actor.companyId, ...jobScope(actor) }, body.note);
  if (!result.ok) return result.response;
  return NextResponse.json({ ok: true, note: result.note });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Same per-company send cap as quotes and invoices.
  const sendRl = await limit(`send:${actor.companyId}`, 120, 60 * 60 * 1000);
  if (!sendRl.ok) {
    return NextResponse.json(
      { error: "Too many sends in the last hour — try again shortly." },
      { status: 429, headers: { "Retry-After": String(sendRl.retryAfterSeconds) } }
    );
  }
  if (await inPreview(actor.companyId)) return NextResponse.json(previewBlockedError("Sending reports to clients"), { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { note?: unknown } | null;
  const result = await sendJobReport({
    jobId: id,
    companyId: actor.companyId,
    scope: jobScope(actor),
    channels: sendChannelsFrom(body, { email: true, text: true }),
    note: typeof body?.note === "string" ? body.note : undefined,
    byUserId: actor.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ emailed: result.emailed, texted: result.texted, to: result.to, phone: result.phone });
}
