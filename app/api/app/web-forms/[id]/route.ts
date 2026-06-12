import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { sanitizeBookingForm } from "@/lib/booking-form";

/** PATCH — edit a form: name, config, isActive, isDefault. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const form = await prisma.webForm.findFirst({ where: { id, companyId: actor.companyId } });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 80);
    if (!name) return NextResponse.json({ error: "Give the form a name." }, { status: 400 });
    data.name = name;
  }
  if (body.config !== undefined) data.config = sanitizeBookingForm(body.config) as object;
  if (body.isActive !== undefined) {
    if (form.isDefault && body.isActive === false) {
      return NextResponse.json({ error: "The default form can't be turned off — make another form the default first." }, { status: 400 });
    }
    data.isActive = Boolean(body.isActive);
  }

  if (body.isDefault === true && !form.isDefault) {
    await prisma.$transaction([
      prisma.webForm.updateMany({
        where: { companyId: actor.companyId, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.webForm.update({ where: { id: form.id }, data: { isDefault: true, isActive: true, ...data } }),
    ]);
    return NextResponse.json({ success: true });
  }

  if (Object.keys(data).length > 0) {
    await prisma.webForm.update({ where: { id: form.id }, data });
  }
  return NextResponse.json({ success: true });
}

/**
 * DELETE — remove a form. Submissions it collected (clients, requests,
 * invoices) are untouched — nothing links back to the form. Deleting the
 * default promotes the oldest remaining active form so the original
 * /book and /embed URLs keep answering.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const form = await prisma.webForm.findFirst({ where: { id, companyId: actor.companyId } });
  if (!form) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.webForm.delete({ where: { id: form.id } });
    if (form.isDefault) {
      const next =
        (await tx.webForm.findFirst({
          where: { companyId: actor.companyId, isActive: true },
          orderBy: { createdAt: "asc" },
        })) ??
        (await tx.webForm.findFirst({
          where: { companyId: actor.companyId },
          orderBy: { createdAt: "asc" },
        }));
      if (next) {
        await tx.webForm.update({
          where: { id: next.id },
          data: { isDefault: true, isActive: true },
        });
      }
    }
  });
  return NextResponse.json({ success: true });
}
