import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { ADS_SAMPLE_HOURS } from "@/lib/ads-conversions";
import { loadAdsFeedStatus } from "@/lib/ads-conversions-server";

/**
 * Paid jobs reported back to Google Ads (Insights → Lead sources → Google
 * Ads). GET reads the status. POST turns the file on, or replaces its
 * address when it is already on (the old address stops working at once);
 * POST { action: "sample" } keeps the address and puts the sample row in
 * the file for two hours (Google's setup cannot read an empty file).
 * DELETE turns it off. Owners and admins.
 */

async function manager() {
  const actor = await getActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!isManager(actor.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { actor } as const;
}

const sampleUntil = () => new Date(Date.now() + ADS_SAMPLE_HOURS * 3600000);

export async function GET() {
  const m = await manager();
  if (m.error) return m.error;
  return NextResponse.json(await loadAdsFeedStatus(m.actor.companyId));
}

export async function POST(req: NextRequest) {
  const m = await manager();
  if (m.error) return m.error;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;

  if (body?.action === "sample") {
    const on = await prisma.company.findUnique({ where: { id: m.actor.companyId }, select: { adsFeedToken: true } });
    if (!on?.adsFeedToken) return NextResponse.json({ error: "Turn it on first." }, { status: 400 });
    await prisma.company.update({ where: { id: m.actor.companyId }, data: { adsFeedSampleUntil: sampleUntil() } });
    return NextResponse.json(await loadAdsFeedStatus(m.actor.companyId));
  }

  // On, or a new address. A fresh address is about to be set up in Google Ads, so the sample row starts with it.
  await prisma.company.update({
    where: { id: m.actor.companyId },
    data: { adsFeedToken: randomBytes(24).toString("hex"), adsFeedFetchedAt: null, adsFeedSampleUntil: sampleUntil() },
  });
  return NextResponse.json(await loadAdsFeedStatus(m.actor.companyId));
}

export async function DELETE() {
  const m = await manager();
  if (m.error) return m.error;
  await prisma.company.update({
    where: { id: m.actor.companyId },
    data: { adsFeedToken: null, adsFeedFetchedAt: null, adsFeedSampleUntil: null },
  });
  return NextResponse.json(await loadAdsFeedStatus(m.actor.companyId));
}
