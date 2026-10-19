import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { listPlaces, parsePlaceInput, placePin, placeSelect, serializePlace } from "@/lib/places";

/**
 * GET — the company's saved places (supply houses, the dump, the yard);
 * `?archived=1` includes archived ones (managers' Places page).
 * POST — save one. Anyone on the team may add a place: a tech standing at
 * a new supply house is exactly who knows its address.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const archived = req.nextUrl.searchParams.get("archived") === "1";
  return NextResponse.json({ places: await listPlaces(actor.companyId, archived) });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const parsed = parsePlaceInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const pin = await placePin(parsed.address!, actor.companyId);
  const place = await prisma.place.create({
    data: {
      companyId: actor.companyId,
      createdById: actor.id,
      name: parsed.name!,
      kind: parsed.kind!,
      address: parsed.address!,
      notes: parsed.notes ?? null,
      lat: pin.lat,
      lng: pin.lng,
      geocodedAt: new Date(),
    },
    select: placeSelect,
  });
  return NextResponse.json({ place: serializePlace(place) }, { status: 201 });
}
