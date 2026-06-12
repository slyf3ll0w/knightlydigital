import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { sanitizeBookingForm } from "@/lib/booking-form";
import { slugifyFormName } from "@/lib/web-forms";

/** POST — duplicate a form (config copied, never default, new slug). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const source = await prisma.webForm.findFirst({ where: { id, companyId: actor.companyId } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const count = await prisma.webForm.count({ where: { companyId: actor.companyId } });
  if (count >= 15) {
    return NextResponse.json({ error: "Limit of 15 forms reached." }, { status: 400 });
  }

  const name = `${source.name} (copy)`.slice(0, 80);
  const base = slugifyFormName(name);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const clash = await prisma.webForm.findFirst({
      where: { companyId: actor.companyId, slug },
      select: { id: true },
    });
    if (!clash) break;
    slug = `${base}-${i}`;
  }

  const copy = await prisma.webForm.create({
    data: {
      companyId: actor.companyId,
      name,
      slug,
      type: source.type,
      isDefault: false,
      config: sanitizeBookingForm(source.config) as object,
    },
  });
  return NextResponse.json(copy, { status: 201 });
}
