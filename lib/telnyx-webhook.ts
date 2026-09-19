import crypto from "crypto";
import type { NextRequest } from "next/server";

/**
 * Telnyx webhook authentication, shared by the messaging and voice routes.
 * Telnyx signs `${timestamp}|${rawBody}` with the account's Ed25519 key and
 * sends the signature + timestamp as headers; TELNYX_PUBLIC_KEY (Mission
 * Control → Account → Keys & Credentials → Public Key) verifies it. Without
 * the key we fail closed — an unauthenticated post must never flip an
 * opt-out flag or drive a live call.
 */

export function telnyxWebhookConfigured(): boolean {
  return Boolean(process.env.TELNYX_PUBLIC_KEY);
}

export function verifyTelnyxSignature(req: NextRequest, raw: string): boolean {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) return false;
  const signature = req.headers.get("telnyx-signature-ed25519");
  const timestamp = req.headers.get("telnyx-timestamp");
  if (!signature || !timestamp) return false;
  // The timestamp is signed, so a captured event could otherwise be replayed
  // forever. Telnyx sends unix seconds; allow 5 minutes of clock skew.
  const ageSec = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSec) || ageSec > 300) return false;
  try {
    // Telnyx publishes a raw 32-byte Ed25519 key (base64); Node wants SPKI DER.
    const key = crypto.createPublicKey({
      key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(publicKey, "base64")]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, Buffer.from(`${timestamp}|${raw}`), key, Buffer.from(signature, "base64"));
  } catch {
    return false;
  }
}
