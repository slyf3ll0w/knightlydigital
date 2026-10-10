import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasAddon } from "@/lib/addon";
import { canSell, getActor } from "@/lib/permissions";
import { companyCanSendSms } from "@/lib/sms";
import { voiceConfigured } from "@/lib/telnyx";

/**
 * GET — can this person's company reach clients from its business line?
 * Siri (ios/App/App/Intents.swift) asks before every call or text so it
 * does the same thing the app's own buttons do: `call` true → the line
 * dials (your cell rings, press 1); false → the phone's own dialer.
 * `text` true → the message goes out from the line through the client
 * thread; false → the phone's Messages app opens with the text filled in.
 * Same conditions as the platform layout's Call buttons and lib/sms.ts.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { lineVoiceAppAt: true, addonActiveAt: true },
  });
  const call = Boolean(company && voiceConfigured() && company.lineVoiceAppAt && hasAddon(company) && canSell(actor.role));
  const text = await companyCanSendSms(actor.companyId);
  return NextResponse.json({ call, text }, { headers: { "Cache-Control": "no-store" } });
}
