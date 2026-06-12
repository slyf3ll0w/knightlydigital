import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, isManager, viaContactScope } from "@/lib/permissions";

/** PATCH — void a contract or edit it while unsigned. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSell(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contract = await prisma.contract.findFirst({
    where: { id, companyId: actor.companyId, ...viaContactScope(actor) },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.status === "VOID") data.status = "VOID";
  if (body.status === "SENT" && contract.status === "VOID") data.status = "SENT";

  if (contract.status !== "SIGNED") {
    if (body.title !== undefined) {
      const title = String(body.title).trim().slice(0, 120);
      if (title) data.title = title;
    }
    if (body.body !== undefined) {
      const text = String(body.body).trim().slice(0, 50000);
      if (text) data.body = text;
    }
  } else if (body.title !== undefined || body.body !== undefined) {
    return NextResponse.json({ error: "Signed contracts can't be edited." }, { status: 400 });
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ success: true });
  const updated = await prisma.contract.update({ where: { id: contract.id }, data });
  return NextResponse.json(updated);
}

/** DELETE — remove a contract (managers; confirm handled in UI). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const contract = await prisma.contract.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.contract.delete({ where: { id: contract.id } });
  return NextResponse.json({ success: true });
}
