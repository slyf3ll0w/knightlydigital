import { NextRequest, NextResponse } from "next/server";
import { handleVoiceEvent, type VoiceEvent } from "@/lib/voice";
import { telnyxWebhookConfigured, verifyTelnyxSignature } from "@/lib/telnyx-webhook";

/**
 * Telnyx Call Control webhook — the `webhook_event_url` of the WorkBench
 * voice application (TELNYX_VOICE_APP_ID). Every event on every call to or
 * from a business line lands here and lib/voice.ts decides the next command.
 *
 * Unlike the registration webhooks this payload IS acted on directly (there
 * is nothing to re-read — the call is live), so the Ed25519 signature check
 * is mandatory: without TELNYX_PUBLIC_KEY the route refuses everything and
 * calls fall through to Telnyx's first-command timeout.
 *
 * Processing happens before the 200 — a Next route has no afterlife — and
 * stays well inside Telnyx's timeout (one or two API calls per event).
 */
export async function POST(req: NextRequest) {
  if (!telnyxWebhookConfigured()) {
    console.error("[voice] TELNYX_PUBLIC_KEY is not set; rejecting webhook");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }
  const raw = await req.text();
  if (!verifyTelnyxSignature(req, raw)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }
  let event: { data?: { event_type?: string; id?: string; payload?: VoiceEvent["payload"] } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }
  const type = event.data?.event_type;
  if (type) {
    await handleVoiceEvent({ event_type: type, id: event.data?.id, payload: event.data?.payload ?? {} });
  }
  return NextResponse.json({ received: true });
}
