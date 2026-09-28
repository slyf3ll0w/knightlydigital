import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { phoneDigits } from "@/lib/phone";
import { toE164 } from "@/lib/sms";
import { linkCallsToContact } from "@/lib/voice";

/**
 * POST { phone } — start (or find) a conversation with a typed-in number.
 *
 * Only a company with its own business line can do this: the thread's texts
 * go out from that number and replies route back by it. The number's
 * existing contact wins (most recently updated when several share it); an
 * unknown number becomes a PLACEHOLDER contact named after the number, kept
 * out of the Clients list, the Leads board and every picker until the
 * thread's Save card names them as a lead, client or contact.
 *
 * Returns { contactId, created } — the caller lands on
 * /app/messages/thread/<contactId>.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { lineNumber: true },
  });
  const line = company?.lineNumber;
  if (!line || line.startsWith("pending:")) {
    return NextResponse.json(
      { error: "Texting a new number needs a business line — set one up in Settings → Phone & texting." },
      { status: 409 }
    );
  }

  const data = await req.json().catch(() => null);
  const raw = typeof data?.phone === "string" ? data.phone.trim() : "";
  const e164 = toE164(raw);
  const digits = phoneDigits(raw);
  if (!e164 || !digits || digits.length !== 10) {
    return NextResponse.json({ error: "Enter a 10-digit US phone number." }, { status: 400 });
  }
  if (phoneDigits(line) === digits) {
    return NextResponse.json({ error: "That's your own business line." }, { status: 400 });
  }

  const existing = await prisma.contact.findFirst({
    where: { companyId: actor.companyId, phoneDigits: digits, ...contactScope(actor) },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ contactId: existing.id, created: false });

  const pretty = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  const contact = await prisma.contact.create({
    data: {
      companyId: actor.companyId,
      hubToken: randomBytes(24).toString("hex"),
      // Named after the number so every list and the thread header read it
      // as one; the Save card replaces both parts.
      firstName: pretty,
      lastName: "",
      phone: e164,
      status: "ACTIVE", // never a lead until saved as one
      kind: "CONTACT",
      placeholder: true,
      assignedToId: actor.id,
      smsConsentSource: "manual",
      smsConsentNote: "Texted first from Messages",
    },
    select: { id: true },
  });
  // Calls from this number that never matched anyone are theirs now.
  await linkCallsToContact(actor.companyId, contact.id, e164).catch(() => 0);

  return NextResponse.json({ contactId: contact.id, created: true }, { status: 201 });
}
