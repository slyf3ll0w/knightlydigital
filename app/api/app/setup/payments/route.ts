import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * The payment-setup step (/app/setup/payments), part 1: who pays the card
 * fee. POST { serviceFee: boolean } sets Company.surchargeEnabled — ON = the
 * client pays the service fee at checkout, OFF = the company pays Square's
 * processing fee (lib/service-fee.ts, lib/plans.ts PROCESSING_RATES). The
 * same switch lives in Settings → Payments & accounting; this is the
 * sign-up-time door to it. Owner only: it decides what every client is
 * charged, and which Square sign-up link the step offers next.
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only the account owner can choose who pays the card fee." }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  if (typeof body?.serviceFee !== "boolean") {
    return NextResponse.json({ error: "Pick who pays the card fee." }, { status: 400 });
  }
  await prisma.company.update({
    where: { id: actor.companyId },
    data: { surchargeEnabled: body.serviceFee },
  });
  return NextResponse.json({ ok: true, serviceFee: body.serviceFee });
}
