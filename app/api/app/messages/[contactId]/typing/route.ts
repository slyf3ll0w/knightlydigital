import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { limit } from "@/lib/rate-limit";
import { markTyping } from "@/lib/chat";

/**
 * Team typing heartbeat on a client thread. In-memory only; the website
 * chat widget reads it back as "… is typing". Harmless on portal and SMS
 * threads, where nothing polls it.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ contactId: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rl = await limit(`thread-typing:${actor.id}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { contactId } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId: actor.companyId, ...contactScope(actor) },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });
  markTyping(`portal:${contact.id}`, actor.id);
  return NextResponse.json({ ok: true });
}
