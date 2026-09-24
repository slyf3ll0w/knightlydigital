import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { advanceLeadForLinkedCalls } from "@/lib/voice";
import { NOTES_MAX_CHARS } from "@/lib/call-notes";

/**
 * PATCH { contactId } — say who a call was with. The call screen uses it
 * right after saving an unknown caller as a lead or client, and to attach a
 * call from an unfamiliar number to someone already in the list. The
 * number-based match (lib/voice.ts linkCallsToContact) covers the common
 * case on its own; this is the explicit version for when the numbers
 * don't line up. `contactId: null` detaches. Linking also moves the lead's
 * board card for what happened on the call (advanceLeadForLinkedCalls) —
 * the call's own hooks ran while the row had no contact.
 *
 * PATCH { notes } — the notes typed on the call screen (autosaved).
 * Company-scoped both ways.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { contactId?: unknown; notes?: unknown };

  if (body.notes !== undefined) {
    if (typeof body.notes !== "string") return NextResponse.json({ error: "Bad notes" }, { status: 400 });
    const notes = body.notes.slice(0, NOTES_MAX_CHARS);
    const r = await prisma.call.updateMany({
      where: { id, companyId: actor.companyId },
      data: { notes: notes.trim() ? notes : null, notesAt: new Date() },
    });
    if (r.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }

  if (body.contactId !== null && typeof body.contactId !== "string") {
    return NextResponse.json({ error: "Missing contactId" }, { status: 400 });
  }
  if (body.contactId) {
    const contact = await prisma.contact.findFirst({
      where: { id: body.contactId, companyId: actor.companyId, ...contactScope(actor) },
      select: { id: true },
    });
    if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  }
  const r = await prisma.call.updateMany({
    where: { id, companyId: actor.companyId },
    data: { contactId: body.contactId },
  });
  if (r.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (body.contactId) await advanceLeadForLinkedCalls(actor.companyId, body.contactId, [id]).catch(() => null);
  return NextResponse.json({ ok: true });
}
