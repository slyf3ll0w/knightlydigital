import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  notifyTeamOfClientMessage,
  portalThreadContactInclude,
} from "@/lib/portal-messages";
import { classifySmsKeyword } from "@/lib/sms-keywords";
import { phoneDigits } from "@/lib/phone";
import { telnyxWebhookConfigured, verifyTelnyxSignature } from "@/lib/telnyx-webhook";
import { fireAutomations } from "@/lib/automations-server";

/**
 * Telnyx inbound-message webhook (set as the webhook URL on the WorkBench
 * messaging profile). Two jobs:
 *
 * 1. Keep Contact.smsOptOut honest — a client texting STOP (the whole
 *    message, nothing else — lib/sms-keywords.ts) opts them out of automated
 *    texts from the companies that have texted them; START/UNSTOP opts them
 *    back in. Telnyx also enforces opt-outs at their edge, so this flag is
 *    about our senders not even attempting the send (and the state being
 *    visible in the app).
 * 2. Land every other text in the portal message thread — a client replying
 *    to an SMS mirror answers straight into /app/messages, no portal visit
 *    needed.
 *
 * Tenant resolution: the number the text was sent TO is a company's business
 * line (Company.lineNumber, lib/business-line.ts), so the company is known
 * before any contact lookup and the contact match is scoped to it — a
 * client of two WorkBench businesses never has a reply land at the wrong
 * one. A text from a number the company has no contact for creates one
 * ("Unknown caller · (214) 555-0100") so the message isn't lost. Texts to a
 * number no company owns (the legacy WorkBench toll-free) fall back to the
 * old cross-tenant best guess via the SmsSend log.
 *
 * Signature check (Ed25519 over `${timestamp}|${rawBody}`) requires
 * TELNYX_PUBLIC_KEY. Without it we fail closed and process nothing —
 * unauthenticated posts must never be able to flip opt-out flags.
 */

export async function POST(req: NextRequest) {
  if (!telnyxWebhookConfigured()) {
    console.error("Telnyx webhook: TELNYX_PUBLIC_KEY is not set; rejecting request");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const raw = await req.text();
  if (!verifyTelnyxSignature(req, raw)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  let event: {
    data?: {
      event_type?: string;
      payload?: {
        from?: { phone_number?: string };
        to?: Array<{ phone_number?: string }>;
        text?: string;
      };
    };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  if (event.data?.event_type === "message.received") {
    const from = event.data.payload?.from?.phone_number ?? "";
    const to = event.data.payload?.to?.[0]?.phone_number ?? "";
    const text = (event.data.payload?.text ?? "").trim();
    const digits = phoneDigits(from);
    const keyword = classifySmsKeyword(text);
    const company = to ? await companyByLine(to) : null;
    if (digits && (keyword === "STOP" || keyword === "START")) {
      await setOptOut(digits, keyword === "STOP", company?.id ?? null);
    } else if (digits && text && keyword !== "HELP") {
      // Everything that isn't a bare keyword is a message for the business
      await landInboundSms(digits, from, text.slice(0, 5000), company?.id ?? null);
    }
  }

  // Always 200 for recognized-but-unhandled events so Telnyx doesn't retry.
  return NextResponse.json({ received: true });
}

/** The company whose business line this is, if any. */
async function companyByLine(to: string): Promise<{ id: string } | null> {
  try {
    return await prisma.company.findUnique({ where: { lineNumber: to }, select: { id: true } });
  } catch {
    return null;
  }
}

/**
 * STOP / START: flip smsOptOut on every contact with this number at the
 * company whose line received it. Without a line match (legacy toll-free),
 * scope to the companies that have texted the number (SmsSend); a number
 * nobody has texted yet lands everywhere it appears, since Telnyx blocks the
 * number at their edge regardless.
 */
async function setOptOut(digits: string, optOut: boolean, companyId: string | null): Promise<void> {
  try {
    let companyIds: string[] = companyId ? [companyId] : [];
    if (!companyId) {
      const senders = await prisma.smsSend.findMany({
        where: { toDigits: digits },
        distinct: ["companyId"],
        select: { companyId: true },
      });
      companyIds = senders.map((s) => s.companyId);
    }
    await prisma.contact.updateMany({
      where: {
        phoneDigits: digits,
        ...(companyIds.length ? { companyId: { in: companyIds } } : {}),
      },
      data: { smsOptOut: optOut },
    });
  } catch (err) {
    console.error("[telnyx] opt-out update failed:", err);
  }
}

/** "(214) 555-0100" for the placeholder contact an unknown texter becomes. */
function prettyDigits(digits: string): string {
  return digits.length === 10 ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

/**
 * Attach an inbound text to the right contact's thread.
 *
 * With the receiving company known (its business line), the match is that
 * company's contact with this phone — most recent thread activity wins if
 * several share a number (a landlord and their tenant) — and an unknown
 * number becomes a new contact so the text has somewhere to land.
 *
 * Without it (legacy toll-free): the company that most recently texted this
 * number (SmsSend), then the contact already in a portal conversation, then
 * the most recently updated contact. Errors never bubble: a failed thread
 * write must not make Telnyx retry.
 */
async function landInboundSms(digits: string, fromE164: string, text: string, companyId: string | null): Promise<void> {
  try {
    const candidates = await prisma.contact.findMany({
      where: { phoneDigits: digits, ...(companyId ? { companyId } : {}) },
      orderBy: { updatedAt: "desc" },
      select: { id: true, companyId: true },
      take: 25,
    });
    if (candidates.length === 0 && !companyId) return;

    let contactId: string;
    if (candidates.length === 0 && companyId) {
      const created = await prisma.contact.create({
        data: {
          companyId,
          firstName: "Unknown caller",
          lastName: prettyDigits(digits),
          phone: fromE164,
          phoneDigits: digits,
          smsConsentSource: "inbound_text",
          smsConsentNote: "Texted the business line first",
        },
        select: { id: true },
      });
      contactId = created.id;
      fireAutomations(companyId, "lead.created", created.id);
    } else {
      contactId = candidates[0].id;
    }
    if (candidates.length > 1 && companyId) {
      const lastActive = await prisma.portalMessage.findFirst({
        where: { contactId: { in: candidates.map((c) => c.id) } },
        orderBy: { createdAt: "desc" },
        select: { contactId: true },
      });
      if (lastActive) contactId = lastActive.contactId;
    } else if (candidates.length > 1) {
      const lastSend = await prisma.smsSend.findFirst({
        where: { toDigits: digits, companyId: { in: candidates.map((c) => c.companyId) } },
        orderBy: { createdAt: "desc" },
        select: { companyId: true, contactId: true },
      });
      const byLastSend =
        lastSend &&
        (candidates.find((c) => c.id === lastSend.contactId) ?? candidates.find((c) => c.companyId === lastSend.companyId));
      if (byLastSend) {
        contactId = byLastSend.id;
      } else {
        const lastActive = await prisma.portalMessage.findFirst({
          where: { contactId: { in: candidates.map((c) => c.id) } },
          orderBy: { createdAt: "desc" },
          select: { contactId: true },
        });
        if (lastActive) contactId = lastActive.contactId;
      }
    }

    // Telnyx retries webhooks on slow responses — drop exact duplicates
    // arriving within a few minutes rather than double-posting the thread.
    const dupe = await prisma.portalMessage.findFirst({
      where: {
        contactId,
        direction: "INBOUND",
        via: "sms",
        body: text,
        createdAt: { gte: new Date(Date.now() - 5 * 60_000) },
      },
      select: { id: true },
    });
    if (dupe) return;

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: portalThreadContactInclude,
    });
    if (!contact) return;

    const message = await prisma.portalMessage.create({
      data: {
        companyId: contact.companyId,
        contactId: contact.id,
        direction: "INBOUND",
        body: text,
        via: "sms",
      },
    });
    fireAutomations(contact.companyId, "message.text_received", message.id);
    await notifyTeamOfClientMessage(contact, message.id, text, "sms");
  } catch (err) {
    console.error("[telnyx] inbound SMS → thread failed:", err);
  }
}
