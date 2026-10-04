import { reportError } from "@/lib/report-error";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { autoAdvance } from "@/lib/pipeline";

/**
 * POST /api/app/contacts/[id]/merge { into: <contactId> }
 *
 * "Add to existing contact" for a number nobody has named: the thread's Save
 * card folds an UNSAVED number — a placeholder (typed-in or an inbound text
 * from an unknown number) or a legacy "Unknown caller" row — into a client
 * the business already has. Everything that hung off the number moves to
 * that client (the message thread with its photos, calls, text log, anything
 * else), the client's phone becomes this number (they are texting from it;
 * the card shows what it replaces), and the unsaved row is deleted. Future
 * texts from the number land on the client straight away, since the inbound
 * webhook matches by phone digits.
 *
 * Refuses to merge a SAVED contact (that would be a real two-client merge
 * with conflicting profiles — not this feature) and anything outside the
 * actor's company / lead scope. Answers { contactId: <target> }.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: { into?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const into = typeof body.into === "string" ? body.into.trim() : "";
  if (!into) return NextResponse.json({ error: "Pick a client to add this number to." }, { status: 400 });
  if (into === id) return NextResponse.json({ error: "That's the same thread." }, { status: 400 });

  const scope = { companyId: actor.companyId, ...contactScope(actor) };
  const [source, target] = await Promise.all([
    prisma.contact.findFirst({
      where: { id, ...scope },
      select: {
        id: true,
        firstName: true,
        email: true,
        phone: true,
        phoneDigits: true,
        placeholder: true,
        smsConsentSource: true,
        smsConsentNote: true,
      },
    }),
    prisma.contact.findFirst({
      where: { id: into, ...scope },
      select: { id: true, firstName: true, lastName: true, phone: true, placeholder: true, smsConsentSource: true, pipelineStageId: true },
    }),
  ]);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!target) return NextResponse.json({ error: "That client wasn't found." }, { status: 404 });
  const unnamed = source.placeholder || (source.firstName === "Unknown caller" && !source.email);
  if (!unnamed) {
    return NextResponse.json({ error: "Only an unsaved number can be added to an existing client." }, { status: 400 });
  }
  if (target.placeholder) {
    return NextResponse.json({ error: "Save that number as a person first, or pick a saved client." }, { status: 400 });
  }
  if (!source.phone) return NextResponse.json({ error: "This thread has no phone number to add." }, { status: 400 });

  const replacedPhone = target.phone && target.phone !== source.phone ? target.phone : null;

  try {
    await prisma.$transaction(async (tx) => {
      const from = { contactId: source.id };
      const to = { contactId: target.id };
      // Everything that can hang off an unsaved number. Required-FK models
      // too (a quote or job started from the thread before anyone saved them).
      await tx.portalMessage.updateMany({ where: from, data: to });
      await tx.call.updateMany({ where: from, data: to });
      await tx.smsSend.updateMany({ where: from, data: to });
      await tx.clientMessage.updateMany({ where: from, data: to });
      await tx.contactNote.updateMany({ where: from, data: to });
      await tx.request.updateMany({ where: from, data: to });
      await tx.appointment.updateMany({ where: from, data: to });
      await tx.quote.updateMany({ where: from, data: to });
      await tx.job.updateMany({ where: from, data: to });
      await tx.invoice.updateMany({ where: from, data: to });
      await tx.payment.updateMany({ where: from, data: to });
      await tx.contract.updateMany({ where: from, data: to });
      await tx.subscription.updateMany({ where: from, data: to });
      await tx.reviewRequest.updateMany({ where: from, data: to });
      await tx.bookingRequest.updateMany({ where: from, data: to });

      await tx.contact.update({
        where: { id: target.id },
        data: {
          // They are texting from this number: it becomes the one on file.
          phone: source.phone,
          phoneDigits: source.phoneDigits,
          // First consent record wins; an inbound text is a fine one to keep.
          ...(!target.smsConsentSource && source.smsConsentSource
            ? { smsConsentSource: source.smsConsentSource, smsConsentNote: source.smsConsentNote }
            : {}),
        },
      });

      // Remaining relations (saved cards, addresses, push subscriptions…) an
      // unsaved number never has — but if one does, don't lose the merge:
      // leave the row behind, unreachable, instead of failing.
      try {
        await tx.contact.delete({ where: { id: source.id } });
      } catch {
        await tx.contact.update({
          where: { id: source.id },
          data: { phone: null, phoneDigits: null, placeholder: true, status: "ARCHIVED" },
        });
      }
    });
  } catch (err) {
    reportError("[contacts] merge into existing failed", id, into, err);
    return NextResponse.json({ error: "Couldn't add the number to that client." }, { status: 500 });
  }

  // The team has already written in this thread → contact made, same trigger
  // a team text fires — the target may be a lead sitting in "New".
  if (target.pipelineStageId) {
    const replied = await prisma.portalMessage.count({
      where: { contactId: target.id, companyId: actor.companyId, direction: "OUTBOUND" },
    });
    if (replied > 0) {
      await autoAdvance(prisma, actor.companyId, target.id, "CONTACT_MADE").catch((err) =>
        reportError("[contacts] CONTACT_MADE advance after merge failed", target.id, err)
      );
    }
  }

  return NextResponse.json({ contactId: target.id, replacedPhone });
}
