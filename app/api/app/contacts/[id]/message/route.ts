import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { sendEmail, clientMessageEmail } from "@/lib/email";
import { inPreview, previewBlockedError } from "@/lib/preview";

// Sending caps. Every one of these goes out on the shared Resend domain, so
// one company blasting its client list (or a compromised login doing it on
// purpose) costs deliverability for every company on the platform. Counted
// from ClientMessage rows, which only exist for sends that actually
// succeeded — a failed send deletes its row below.
const MAX_MESSAGES_PER_COMPANY_PER_DAY = 200;
const MAX_MESSAGES_PER_CONTACT_PER_DAY = 10;

/**
 * POST — email the client a one-off professional message ({ subject, body }).
 * The email carries the full message inline (body, signature, optional logo)
 * plus a quiet "View this message online" link to /message/[token] and a
 * tracking pixel, so opens land on the timeline and push the team. Replies
 * come back to the company inbox via Reply-To.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Emailing clients"), { status: 403 });
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
  // Per-email signature override from the compose box; undefined = use the
  // sender's saved/default signature. Explicit empty string = no signature.
  const signatureOverride =
    typeof data?.signature === "string" ? data.signature.trim().slice(0, 1000) : undefined;
  const includeLogo = data?.includeLogo !== false; // logo rides along by default
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

  const since = new Date(Date.now() - 86400_000);
  const [sentToday, sentToContact] = await Promise.all([
    prisma.clientMessage.count({
      where: { companyId: actor.companyId, createdAt: { gte: since } },
    }),
    prisma.clientMessage.count({
      where: { companyId: actor.companyId, contactId: contact.id, createdAt: { gte: since } },
    }),
  ]);
  if (sentToday >= MAX_MESSAGES_PER_COMPANY_PER_DAY) {
    return NextResponse.json(
      {
        error: `That's ${MAX_MESSAGES_PER_COMPANY_PER_DAY} client emails in 24 hours — the daily limit. It resets on a rolling basis, so try again shortly.`,
      },
      { status: 429 }
    );
  }
  if (sentToContact >= MAX_MESSAGES_PER_CONTACT_PER_DAY) {
    return NextResponse.json(
      {
        error: `You've emailed ${contact.firstName} ${MAX_MESSAGES_PER_CONTACT_PER_DAY} times today — give them a chance to reply before sending more.`,
      },
      { status: 429 }
    );
  }

  // Compose-box override wins; then the sender's saved signature; then a
  // professional default from what we know
  const sender = await prisma.user.findUnique({
    where: { id: actor.id },
    select: { name: true, emailSignature: true },
  });
  const signature =
    signatureOverride !== undefined
      ? signatureOverride
      : sender?.emailSignature?.trim() ||
        [
          sender?.name,
          contact.company.name,
          contact.company.phone,
          contact.company.website,
        ]
          .filter(Boolean)
          .join("\n");

  const message = await prisma.clientMessage.create({
    data: {
      companyId: actor.companyId,
      contactId: contact.id,
      senderId: actor.id,
      subject,
      body,
      signature,
    },
  });

  // Trailing slash on NEXTAUTH_URL would make a //message/... link
  const baseUrl = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/+$/, "");
  const email = clientMessageEmail({
    messageSubject: subject,
    messageBody: body,
    signature,
    logoUrl: includeLogo ? contact.company.logoUrl : null,
    readUrl: `${baseUrl}/message/${message.publicToken}`,
    pixelUrl: `${baseUrl}/api/public/open/${message.publicToken}`,
  });
  const emailed = await sendEmail({
    companyId: actor.companyId,
    to: contact.email,
    subject: email.subject,
    html: email.html,
    replyTo: contact.company.email || undefined,
    fromName: contact.company.name,
    pageBackground: "#ffffff",
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
