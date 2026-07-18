import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";

/**
 * Telnyx inbound-message webhook (set as the webhook URL on the WorkBench
 * messaging profile). One job: keep Contact.smsOptOut honest — a client
 * texting STOP to any pool number opts them out of automated texts
 * everywhere their number appears; START/UNSTOP opts them back in. Telnyx
 * also enforces opt-outs at their edge, so this flag is about our senders
 * not even attempting the send (and the state being visible in the app).
 *
 * Signature check (Ed25519 over `${timestamp}|${rawBody}`) runs when
 * TELNYX_PUBLIC_KEY is set. Without it we still process events: the only
 * effect a forged payload could have is flipping an opt-out flag, and the
 * conservative direction (opting someone out) is the harmless one.
 */

const STOP_RE = /^\s*(stop|stopall|unsubscribe|cancel|end|quit)\b/i;
const START_RE = /^\s*(start|unstop|yes)\b/i;

function verifySignature(req: NextRequest, raw: string): boolean {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) return true; // unset = accept (see header comment)
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
    const text = event.data.payload?.text ?? "";
    const last10 = from.replace(/\D/g, "").slice(-10);
    const optOut = STOP_RE.test(text) ? true : START_RE.test(text) ? false : null;
    if (optOut !== null && last10.length === 10) {
      // Contact.phone is freeform ("(214) 555-0100") — match on the digits.
      await prisma.$executeRaw`
        UPDATE "Contact"
        SET "smsOptOut" = ${optOut}
        WHERE regexp_replace(coalesce("phone", ''), '\D', '', 'g') LIKE ${"%" + last10}`;
    }
  }

  // Always 200 for recognized-but-unhandled events so Telnyx doesn't retry.
  return NextResponse.json({ received: true });
}
