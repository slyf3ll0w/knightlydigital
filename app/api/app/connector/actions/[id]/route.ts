import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * POST { status: "done" | "dismissed" } — the person answered a card an
 * outside AI prepared (Settings → Notifications & AI → Connected apps). This only records the
 * answer. The work itself is done by the page calling the card's own app
 * route with the person's session, exactly as an Atlas card is confirmed —
 * so every role and ownership check runs again there. An answered card is
 * emptied: only pending cards are ever read, and a card can hold a
 * generated password.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status === "done" ? "done" : body.status === "dismissed" ? "dismissed" : null;
  if (!status) return NextResponse.json({ error: "Pass done or dismissed." }, { status: 400 });
  const out = await prisma.connectorAction.updateMany({ where: { id, userId: actor.id, companyId: actor.companyId, status: "pending" }, data: { status, decidedAt: new Date(), proposal: {} } });
  if (out.count === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
