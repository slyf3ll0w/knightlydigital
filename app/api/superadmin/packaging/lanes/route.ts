import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSuperadmin } from "@/lib/superadmin";

/** Add a tier or an add-on column to the packaging board. */
export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ error: "Give the column a name." }, { status: 400 });

  const kind = body.kind === "ADDON" ? "ADDON" : "TIER";
  const last = await prisma.packagingLane.aggregate({ _max: { sort: true } });

  const lane = await prisma.packagingLane.create({
    data: {
      name,
      kind,
      price: typeof body.price === "string" ? body.price.trim().slice(0, 40) || null : null,
      priceNote:
        typeof body.priceNote === "string" ? body.priceNote.trim().slice(0, 80) || null : null,
      blurb: typeof body.blurb === "string" ? body.blurb.trim().slice(0, 200) || null : null,
      accent: /^#[0-9a-f]{6}$/i.test(body.accent ?? "") ? body.accent : null,
      sort: (last._max.sort ?? 0) + 1,
    },
  });

  return NextResponse.json({ success: true, id: lane.id });
}
