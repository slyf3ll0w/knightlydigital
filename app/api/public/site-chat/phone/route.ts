import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientIp, limit } from "@/lib/rate-limit";
import { parseUsPhone, siteChatCompanyId, verifySiteChatToken } from "@/lib/site-chat";

/**
 * The visitor adds a phone number after the chat has started. Requires the
 * consent box; records it the same way the booking form does
 * (smsConsentAt/Source/Note) so a reply can go out as a text once the line
 * is approved. Never overwrites a number the contact already has.
 */
export async function POST(req: NextRequest) {
  const rl = await limit(`site-chat:phone:${clientIp(req.headers)}`, 10, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tries. Give it a few minutes." }, { status: 429 });
  const companyId = await siteChatCompanyId();
  const data = await req.json().catch(() => null);
  const contactId = verifySiteChatToken(typeof data?.token === "string" ? data.token : null);
  if (!contactId || !companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = typeof data?.phone === "string" ? parseUsPhone(data.phone.slice(0, 30)) : null;
  if (!parsed) return NextResponse.json({ error: "Enter a 10-digit US phone number." }, { status: 400 });
  if (data?.consent !== true) {
    return NextResponse.json({ error: "Check the box so we're allowed to text you." }, { status: 400 });
  }

  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true, phone: true } });
  if (!contact) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (contact.phone) return NextResponse.json({ ok: true, hasPhone: true });

  await prisma.contact.update({
    where: { id: contact.id },
    data: {
      phone: parsed.phone,
      phoneDigits: parsed.digits,
      smsOptOut: false,
      smsConsentAt: new Date(),
      smsConsentSource: "web_chat",
      smsConsentNote: "Added their number during the website chat and checked the text-me box",
    },
  });
  return NextResponse.json({ ok: true, hasPhone: true });
}
