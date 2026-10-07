import { NextRequest, NextResponse } from "next/server";
import { limit } from "@/lib/rate-limit";
import { getActor, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { inPreview, previewBlockedError } from "@/lib/preview";
import { readSendRequest } from "@/lib/send-channels";
import { sendInvoice, SEND_DEFAULTS } from "@/lib/send-document";

/**
 * POST — email / text the client their invoice pay link and mark the invoice
 * sent. One click from the invoice page; DRAFT invoices move to Awaiting
 * Payment (same lifecycle as Mark as Sent). The send itself lives in
 * lib/send-document.ts so Send later does exactly the same thing.
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
    return NextResponse.json(previewBlockedError("Emailing invoices to clients"), { status: 403 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  // Two ways to reach them: email, and a text from the business line once
  // texting is on. Either alone is enough. The sender picks the channels
  // (components/SendChoice.tsx); no body = both.
  // `expectScheduled` comes from the "Send now" link under a scheduled draft:
  // 409 when the sweep already took it, so the client isn't emailed twice.
  const { channels, expectScheduled } = await readSendRequest(req, SEND_DEFAULTS.invoice);
  const result = await sendInvoice({ id, companyId: actor.companyId, scope: viaContactScope(actor), channels, expectScheduled });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ emailed: result.emailed, texted: result.texted, to: result.to, phone: result.phone });
}
