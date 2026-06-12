import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { defaultConfigForType, listWebForms, slugifyFormName } from "@/lib/web-forms";

const validTypes = ["INQUIRY", "BOOKING", "SERVICE_REQUEST"];

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { bookingForm: true },
  });
  return NextResponse.json(await listWebForms(actor.companyId, company?.bookingForm));
}

/** POST — create a form: { name, type } */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return NextResponse.json({ error: "Give the form a name." }, { status: 400 });
  const type = validTypes.includes(body.type) ? body.type : "INQUIRY";

  const count = await prisma.webForm.count({ where: { companyId: actor.companyId } });
  if (count >= 15) {
    return NextResponse.json({ error: "Limit of 15 forms reached." }, { status: 400 });
  }

  // unique slug per company
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

  const form = await prisma.webForm.create({
    data: {
      companyId: actor.companyId,
      name,
      slug,
      type,
      isDefault: count === 0,
      config: defaultConfigForType(type) as object,
    },
  });
  return NextResponse.json(form, { status: 201 });
}
