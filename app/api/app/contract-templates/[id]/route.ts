import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

/** PATCH — edit a template (name, body, archive/restore). Managers. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const template = await prisma.contractTemplate.findFirst({
    where: { id, companyId: actor.companyId },
  });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 100);
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    data.name = name;
  }
  if (body.body !== undefined) {
    const text = String(body.body).trim().slice(0, 50000);
    if (!text) return NextResponse.json({ error: "Contract text is required." }, { status: 400 });
    data.body = text;
  }
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  const updated = await prisma.contractTemplate.update({ where: { id: template.id }, data });
  return NextResponse.json(updated);
}
