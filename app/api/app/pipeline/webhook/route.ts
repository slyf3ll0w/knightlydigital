import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/**
 * The company's lead-intake webhook (Settings → Lead Pipeline). POST mints
 * (or rotates) the endpoint token — rotation kills any integration using the
 * old URL instantly. DELETE turns intake off.
 */

function webhookUrl(token: string): string {
  const base = (process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com").replace(/\/$/, "");
  return `${base}/api/public/leads/${token}`;
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { leadWebhookToken: true },
  });
  return NextResponse.json({
    enabled: !!company?.leadWebhookToken,
    url: company?.leadWebhookToken ? webhookUrl(company.leadWebhookToken) : null,
  });
}

export async function POST() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = randomBytes(24).toString("hex");
  await prisma.company.update({
    where: { id: actor.companyId },
    data: { leadWebhookToken: token },
  });
  return NextResponse.json({ enabled: true, url: webhookUrl(token) });
}

export async function DELETE() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.company.update({
    where: { id: actor.companyId },
    data: { leadWebhookToken: null },
  });
  return NextResponse.json({ enabled: false, url: null });
}
