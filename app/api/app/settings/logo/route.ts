import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";

// Client-side optimization shrinks uploads before they get here; this is a
// generous backstop, not the user-facing limit.
const MAX_BYTES = 2 * 1024 * 1024;
// No SVG: same-origin SVGs can carry scripts
const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Upload a company logo (multipart form, field "file"). */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const companyId = actor.companyId;

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json(
      { error: "Use a PNG, JPG, WebP, or GIF image." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Processed logo is too large." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const logoUrl = `/api/logo/${companyId}?v=${Date.now()}`;

  await prisma.company.update({
    where: { id: companyId },
    data: { logoData: bytes, logoMime: file.type, logoUrl },
  });

  return NextResponse.json({ logoUrl });
}

/** Remove the company logo. */
export async function DELETE() {
  const actor = await getActor();
  if (!actor || !isManager(actor.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const companyId = actor.companyId;

  await prisma.company.update({
    where: { id: companyId },
    data: { logoData: null, logoMime: null, logoUrl: null },
  });

  return NextResponse.json({ success: true });
}
