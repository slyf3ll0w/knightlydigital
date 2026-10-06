import { NextRequest, NextResponse } from "next/server";
import { limit } from "@/lib/rate-limit";
import { getActor, canSell, viaContactScope } from "@/lib/permissions";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { readSendChannels } from "@/lib/send-channels";
import { sendQuote, SEND_DEFAULTS } from "@/lib/send-document";

/**
 * POST — email / text the client their quote link and mark the quote sent.
 * The owner-initiated counterpart to "Copy client link": one click, the
 * client gets the approval page in their inbox, and the quote moves to
 * Awaiting Response (same lifecycle as Mark as Sent). The send itself lives
 * in lib/send-document.ts so Send later does exactly the same thing.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Sends cost money (email/SMS) and land in a client's inbox — cap per
  // company so one compromised login can't mailbomb or run up the bill
  const sendRl = await limit(`send:${actor.companyId}`, 120, 60 * 60 * 1000);
  if (!sendRl.ok) {
    return NextResponse.json(
      { error: "Too many sends in the last hour — try again shortly." },
      { status: 429, headers: { "Retry-After": String(sendRl.retryAfterSeconds) } }
    );
  }
  if (await inPreview(actor.companyId))
    return NextResponse.json(previewBlockedError("Emailing quotes to clients"), { status: 403 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  // Email by default; a text from the business line only when the sender
  // ticks it (components/SendChoice.tsx) — quote texts stayed off by default
  // after the 2026-09-24 campaign review read them as marketing.
  const channels = await readSendChannels(req, SEND_DEFAULTS.quote);
  const result = await sendQuote({ id, companyId: actor.companyId, scope: viaContactScope(actor), channels });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ emailed: result.emailed, texted: result.texted, to: result.to, phone: result.phone });
}
