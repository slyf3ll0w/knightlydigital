import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { clientIp, limit } from "@/lib/rate-limit";
import { notifyTeamOfClientMessage, portalThreadContactInclude } from "@/lib/portal-messages";
import { fireAutomations } from "@/lib/automations-server";
import { siteChatCompanyId, siteChatSecret } from "@/lib/site-chat";

/**
 * Website chat (the "Chat with us" widget on the marketing site).
 *
 * A visitor's message lands in the WorkBench company that owns the
 * business line on the site (lib/site-chat.ts; SITE_CHAT_COMPANY_ID
 * overrides) as an INBOUND PortalMessage on a contact created for that
 * visitor — the same thread an inbound text on the business line lands in,
 * so the team sees it in Messages, gets the push, and answers from the app
 * like any other client. The widget polls GET for the team's replies, so
 * the conversation is two-way in the browser even while outbound texting is
 * still unapproved; once texting is live, a visitor who left a number also
 * gets the reply as an SMS from the business line (notifyClientOfReply).
 *
 * The visitor holds an HMAC-signed contact id (no schema change, no hub
 * token exposure). Rate-limited per IP; a honeypot field drops bots quietly.
 */

function sign(contactId: string): string {
  return `${contactId}.${createHmac("sha256", siteChatSecret()).update(contactId).digest("base64url")}`;
}

function verify(token: string | null | undefined): string | null {
  if (!token || !siteChatSecret()) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const expected = sign(id);
  if (expected.length !== token.length) return null;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token)) ? id : null;
}

const serialize = (m: {
  id: string;
  direction: string;
  body: string;
  createdAt: Date;
  sender: { name: string | null } | null;
}) => ({
  id: m.id,
  from: m.direction === "INBOUND" ? ("you" as const) : ("team" as const),
  body: m.body,
  at: m.createdAt.toISOString(),
  senderName: m.direction === "INBOUND" ? null : (m.sender?.name?.split(" ")[0] ?? null),
});

function splitName(raw: string): { firstName: string; lastName: string } {
  const parts = raw.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Website", lastName: "visitor" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const notReady = () => NextResponse.json({ error: "Chat is not set up yet." }, { status: 503 });

export async function POST(req: NextRequest) {
  const companyId = await siteChatCompanyId();
  if (!companyId || !siteChatSecret()) return notReady();
  const ip = clientIp(req.headers);
  const rl = await limit(`site-chat:post:${ip}`, 12, 10 * 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Slow down a little and try again." }, { status: 429 });
  }

  const data = await req.json().catch(() => null);
  if (!data || typeof data !== "object") return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const body = typeof data.message === "string" ? data.message.trim() : "";
  const website = typeof data.website === "string" ? data.website : "";
  if (website) return NextResponse.json({ ok: true }); // honeypot
  if (!body || body.length > 2000) {
    return NextResponse.json({ error: "Write a message (2,000 characters max)." }, { status: 400 });
  }

  let contactId = verify(typeof data.token === "string" ? data.token : null);
  if (contactId) {
    const exists = await prisma.contact.findFirst({ where: { id: contactId, companyId }, select: { id: true } });
    if (!exists) contactId = null;
  }

  if (!contactId) {
    const name = typeof data.name === "string" ? data.name.slice(0, 80) : "";
    const phoneRaw = typeof data.phone === "string" ? data.phone.trim().slice(0, 30) : "";
    const email = typeof data.email === "string" ? data.email.trim().slice(0, 120) : "";
    const digits = phoneRaw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
    const phone = digits.length === 10 ? `+1${digits}` : null;
    let created: { id: string };
    try {
      created = await prisma.contact.create({
        data: {
          companyId,
          ...splitName(name),
          email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
          phone,
          phoneDigits: phone ? digits : null,
          leadSource: "Website chat",
          ...(phone
            ? { smsConsentSource: "web_chat", smsConsentNote: "Left their number in the website chat and asked to be texted back" }
            : {}),
        },
        select: { id: true },
      });
    } catch (err) {
      // A wrong SITE_CHAT_COMPANY_ID (no such company) lands here.
      console.error("[site-chat] contact create failed:", err);
      return notReady();
    }
    contactId = created.id;
    fireAutomations(companyId, "lead.created", created.id);
  }

  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: portalThreadContactInclude });
  if (!contact) return notReady();

  const message = await prisma.portalMessage.create({
    data: { companyId: contact.companyId, contactId: contact.id, direction: "INBOUND", body, via: "web" },
    include: { sender: { select: { name: true } } },
  });
  notifyTeamOfClientMessage(contact, message.id, body, "web").catch((err) =>
    console.error("[site-chat] notify failed:", err)
  );

  return NextResponse.json({ token: sign(contact.id), message: serialize(message) }, { status: 201 });
}

export async function GET(req: NextRequest) {
  const companyId = await siteChatCompanyId();
  const contactId = verify(req.nextUrl.searchParams.get("token"));
  if (!contactId || !companyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ip = clientIp(req.headers);
  const rl = await limit(`site-chat:get:${ip}`, 120, 10 * 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const after = req.nextUrl.searchParams.get("after");
  const afterDate = after ? new Date(after) : null;
  const messages = await prisma.portalMessage.findMany({
    where: {
      contactId,
      companyId,
      ...(afterDate && !isNaN(afterDate.getTime()) ? { createdAt: { gt: afterDate } } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { sender: { select: { name: true } } },
  });
  if (messages.some((m) => m.direction === "OUTBOUND" && !m.readByClientAt)) {
    await prisma.portalMessage.updateMany({
      where: { contactId, direction: "OUTBOUND", readByClientAt: null },
      data: { readByClientAt: new Date() },
    });
  }
  return NextResponse.json({ messages: messages.map(serialize) });
}
