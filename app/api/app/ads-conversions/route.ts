import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { loadAdsFeedStatus } from "@/lib/ads-conversions-server";

/**
 * Paid jobs reported back to Google Ads (Insights → Lead sources → Google
 * Ads). GET reads the status. POST turns the file on, or replaces its
 * address when it is already on (the old address stops working at once).
 * DELETE turns it off. Owners and admins.
 */

async function manager() {
  const actor = await getActor();
  if (!actor) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  if (!isManager(actor.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { actor } as const;
}

export async function GET() {
  const m = await manager();
  if (m.error) return m.error;
  return NextResponse.json(await loadAdsFeedStatus(m.actor.companyId));
}

export async function POST() {
  const m = await manager();
  if (m.error) return m.error;
  await prisma.company.update({
    where: { id: m.actor.companyId },
    data: { adsFeedToken: randomBytes(24).toString("hex"), adsFeedFetchedAt: null },
  });
  return NextResponse.json(await loadAdsFeedStatus(m.actor.companyId));
}

export async function DELETE() {
  const m = await manager();
  if (m.error) return m.error;
  await prisma.company.update({
    where: { id: m.actor.companyId },
    data: { adsFeedToken: null, adsFeedFetchedAt: null },
  });
  return NextResponse.json(await loadAdsFeedStatus(m.actor.companyId));
}
