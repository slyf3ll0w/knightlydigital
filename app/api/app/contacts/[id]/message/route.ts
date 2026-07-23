import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { sendEmail, clientMessageEmail } from "@/lib/email";

/**
 * POST — email the client a one-off professional message ({ subject, body }).
 * The email carries the subject + a "Read message" button; the body lives on
 * the public /message/[token] page so the open is tracked by the view beacon
 * (and pushes the team) exactly like quotes. Replies come back to the
 * company inbox via Reply-To.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId, ...contactScope(actor) },
    include: { company: true },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  if (!contact.email) {
    return NextResponse.json(
      { error: "This client has no email on file — add one first." },
      { status: 400 }
    );
  }

  const data = await req.json().catch(() => null);
  const subject = typeof data?.subject === "string" ? data.subject.trim() : "";
  const body = typeof data?.body === "string" ? data.body.trim() : "";
  if (!subject || subject.length > 150) {
    return NextResponse.json(
      { error: "Add a subject (150 characters max)." },
      { status: 400 }
    );
  }
  if (!body || body.length > 10000) {
    return NextResponse.json(
      { error: "Write a message (10,000 characters max)." },
      { status: 400 }
    );
  }

  const message = await prisma.clientMessage.create({
    data: {
      companyId: actor.companyId,
      contactId: contact.id,
      senderId: actor.id,
      subject,
      body,
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  const email = clientMessageEmail({
    brand: contact.company,
    companyName: contact.company.name,
    contactFirstName: contact.firstName,
    messageSubject: subject,
    readUrl: `${baseUrl}/message/${message.publicToken}`,
  });
  const emailed = await sendEmail({
    companyId: actor.companyId,
    to: contact.email,
    subject: email.subject,
    html: email.html,
    replyTo: contact.company.email || undefined,
    fromName: contact.company.name,
  });
  if (!emailed) {
    // Never leave an unsent message looking sent on the timeline
    await prisma.clientMessage.delete({ where: { id: message.id } });
    return NextResponse.json(
      { error: "Email isn't set up on this server yet — the message wasn't sent." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, to: contact.email, messageId: message.id });
}
