import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import {
  notifyTeamOfClientMessage,
  portalThreadContactInclude,
} from "@/lib/portal-messages";

/**
 * Telnyx inbound-message webhook (set as the webhook URL on the WorkBench
 * messaging profile). Two jobs:
 *
 * 1. Keep Contact.smsOptOut honest — a client texting STOP to any pool
 *    number opts them out of automated texts everywhere their number
 *    appears; START/UNSTOP opts them back in. Telnyx also enforces opt-outs
 *    at their edge, so this flag is about our senders not even attempting
 *    the send (and the state being visible in the app).
 * 2. Land conversational texts in the portal message thread — a client
 *    replying to an SMS mirror answers straight into /app/messages, no
 *    portal visit needed.
 *
 * Signature check (Ed25519 over `${timestamp}|${rawBody}`) requires
 * TELNYX_PUBLIC_KEY. Without it we fail closed and process nothing —
 * unauthenticated posts must never be able to flip opt-out flags.
 */

const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\b/i;
const START_RE = /^\s*(start|unstop|yes)\b/i;

function verifySignature(req: NextRequest, raw: string): boolean {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) return false;
  const signature = req.headers.get("telnyx-signature-ed25519");
  const timestamp = req.headers.get("telnyx-timestamp");
  if (!signature || !timestamp) return false;
  try {
    // Telnyx publishes a raw 32-byte Ed25519 key (base64); Node wants SPKI DER.
    const key = crypto.createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(publicKey, "base64"),
      ]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(
      null,
      Buffer.from(`${timestamp}|${raw}`),
      key,
      Buffer.from(signature, "base64")
    );
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.TELNYX_PUBLIC_KEY) {
    console.error("Telnyx webhook: TELNYX_PUBLIC_KEY is not set; rejecting request");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const raw = await req.text();
  if (!verifySignature(req, raw)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  let event: { data?: { event_type?: string; payload?: { from?: { phone_number?: string }; text?: string } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  if (event.data?.event_type === "message.received") {
    const from = event.data.payload?.from?.phone_number ?? "";
    const text = (event.data.payload?.text ?? "").trim();
    const last10 = from.replace(/\D/g, "").slice(-10);
    const optOut = STOP_RE.test(text) ? true : START_RE.test(text) ? false : null;
    if (optOut !== null && last10.length === 10) {
      // Contact.phone is freeform ("(214) 555-0100") — match on the digits.
      await prisma.$executeRaw`
        UPDATE "Contact"
        SET "smsOptOut" = ${optOut}
        WHERE regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') LIKE ${"%" + last10}`;
    } else if (text && last10.length === 10) {
      // Conversational text → the portal message thread
      await landInboundSms(last10, text.slice(0, 5000));
    }
  }

  // Always 200 for recognized-but-unhandled events so Telnyx doesn't retry.
  return NextResponse.json({ received: true });
}

/**
 * Attach an inbound text to the right contact's thread. The sender is only
 * identified by phone number, and the pool numbers are shared across
 * companies — so when several contacts carry this number (multi-tenant, or
 * duplicates within one company), prefer the one already in a portal
 * conversation (most recent thread activity), then the most recently
 * updated contact. Errors never bubble: a failed thread write must not make
 * Telnyx retry (and re-run the opt-out block).
 */
async function landInboundSms(last10: string, text: string): Promise<void> {
  try {
    const candidates = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Contact"
      WHERE regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g') LIKE ${"%" + last10}
      ORDER BY "updatedAt" DESC
      LIMIT 25`;
    if (candidates.length === 0) return;

    let contactId = candidates[0].id;
    if (candidates.length > 1) {
      const lastActive = await prisma.portalMessage.findFirst({
        where: { contactId: { in: candidates.map((c) => c.id) } },
        orderBy: { createdAt: "desc" },
        select: { contactId: true },
      });
      if (lastActive) contactId = lastActive.contactId;
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
    await notifyTeamOfClientMessage(contact, message.id, text, "sms");
  } catch (err) {
    console.error("[telnyx] inbound SMS → thread failed:", err);
  }
}
