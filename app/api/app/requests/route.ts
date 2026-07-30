import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, contactScope } from "@/lib/permissions";
import { enterPipeline, autoAdvance } from "@/lib/pipeline";
import { withDocNumberRetry } from "@/lib/doc-numbers";
import { inPreview, PREVIEW_CAP, previewCapError } from "@/lib/preview";

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;
  if (await inPreview(companyId)) {
    const n = await prisma.request.count({ where: { companyId } });
    if (n >= PREVIEW_CAP) return NextResponse.json(previewCapError("requests"), { status: 403 });
  }

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

  const request = await withDocNumberRetry(async () => {
    const last = await prisma.request.findFirst({
      where: { companyId },
      orderBy: { requestNumber: "desc" },
    });

    return prisma.request.create({
      data: {
        companyId,
        contactId,
        requestNumber: (last?.requestNumber ?? 0) + 1,
        title,
        details: details || null,
      },
    });
  });

  // Pipeline board: a fresh request puts the contact on the board (repeat
  // clients re-enter with a Repeat badge) and advances any stage claiming it
  await enterPipeline(prisma, companyId, contact.id);
  await autoAdvance(prisma, companyId, contact.id, "REQUEST_CREATED");

  return NextResponse.json(request, { status: 201 });
}
