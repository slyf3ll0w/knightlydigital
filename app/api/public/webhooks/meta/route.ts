import { NextRequest, NextResponse, after } from "next/server";
import { timingSafeEqual } from "crypto";
import { reportError } from "@/lib/report-error";
import { parseLeadgenNotices, verifyMetaSignature } from "@/lib/meta-leads-shape";
import { fileLead, recordNotices } from "@/lib/meta-leads";

/**
 * Facebook's webhook receiver (lib/meta-leads.ts). One subscription, made on
 * WorkBench's Meta app (Webhooks → Page → field `leadgen`):
 *   URL            ${NEXTAUTH_URL}/api/public/webhooks/meta
 *   verify token   META_WEBHOOK_VERIFY_TOKEN
 *
 * GET is Facebook's handshake when the subscription is saved: it sends the
 * verify token and a challenge, and expects the challenge back.
 *
 * POST is a lead notice. SECURITY: the signature (X-Hub-Signature-256, HMAC
 * of the exact body under META_APP_SECRET) is checked first; a bad one is a
 * 401 and nothing is read. Then the body is only a HINT: it names a lead,
 * and the lead's answers are read from Facebook with the Page's own token
 * before anything is filed. Each lead is recorded once (unique on Facebook's
 * lead id), so a resend files nothing twice. Always 200 after the signature
 * passes: Facebook resends anything else for 36 hours.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";
  const given = sp.get("hub.verify_token") ?? "";
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  const ok = expected.length >= 8 && sp.get("hub.mode") === "subscribe" && a.length === b.length && timingSafeEqual(a, b);
  if (!ok) return new NextResponse("Forbidden", { status: 403 });
  // the challenge is echoed as plain text, cut to what Facebook sends (digits)
  return new NextResponse((sp.get("hub.challenge") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 200), { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyMetaSignature(rawBody, req.headers.get("x-hub-signature-256"), process.env.META_APP_SECRET)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }
  try {
    const fresh = await recordNotices(parseLeadgenNotices(JSON.parse(rawBody)));
    // answer Facebook now; read and file the leads after (the hourly cron retries any that fail)
    if (fresh.length > 0) {
      after(async () => {
        for (const id of fresh) await fileLead(id).catch((err) => reportError("[meta-webhook] filing failed", err));
      });
    }
  } catch (err) {
    reportError("[meta-webhook] could not record a lead notice", err);
  }
  return NextResponse.json({ received: true });
}
