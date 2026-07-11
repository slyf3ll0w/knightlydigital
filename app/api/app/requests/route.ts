import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { enterPipeline, autoAdvance } from "@/lib/pipeline";

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const { contactId, title, details } = body;

  if (!contactId || !title) {
    return NextResponse.json({ error: "Client and title are required." }, { status: 400 });
  }

  // Sales/user can only raise requests for their own leads
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, companyId, ...contactScope(actor) },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  const last = await prisma.request.findFirst({
    where: { companyId },
    orderBy: { requestNumber: "desc" },
  });

  const request = await prisma.request.create({
    data: {
      companyId,
      contactId,
      requestNumber: (last?.requestNumber ?? 0) + 1,
      title,
      details: details || null,
    },
  });

  // Pipeline board: a fresh request puts the contact on the board (repeat
  // clients re-enter with a Repeat badge) and advances any stage claiming it
  await enterPipeline(prisma, companyId, contact.id);
  await autoAdvance(prisma, companyId, contact.id, "REQUEST_CREATED");

  return NextResponse.json(request, { status: 201 });
}
