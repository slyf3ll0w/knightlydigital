import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { logActivity } from "@/lib/activity";

/**
 * POST — rotate a client's portal link. The hub token IS the client's login
 * (quotes, invoices, saved cards all key off it) and it used to be permanent:
 * a forwarded email, a shared phone or a departed tenant kept working
 * forever. Resetting mints a new token; every old link stops working the
 * moment this returns. Managers only — it locks the client out until the new
 * link is sent.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, companyId: actor.companyId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const hubToken = randomBytes(24).toString("hex");
  await prisma.contact.update({ where: { id: contact.id }, data: { hubToken } });

  logActivity({
    companyId: actor.companyId,
    userId: actor.id,
    userName: actor.name,
    entityType: "contact",
    entityId: contact.id,
    action: "portal_link_reset",
    detail: "Portal link reset — previous links no longer work.",
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "https://workbenchfsm.com";
  return NextResponse.json({ success: true, hubUrl: `${baseUrl}/hub/${hubToken}` });
}
