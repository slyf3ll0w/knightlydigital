/**
 * Places — the spots a crew drives to that aren't clients: supply houses,
 * the dump, the yard. Saved once (geocoded once), picked in two taps when
 * adding a stop to a route, and copied onto the errand / task so the stop
 * stands on its own if the place is later archived.
 */

import { prisma } from "@/lib/db";
import { geocodeAddress } from "@/lib/geocoding";

export * from "@/lib/places-shared";
import { PLACE_ADDRESS_MAX, PLACE_KINDS, PLACE_NAME_MAX, PLACE_NOTES_MAX, type PlaceDTO, type PlaceKind } from "@/lib/places-shared";

export const placeSelect = {
  id: true,
  name: true,
  kind: true,
  address: true,
  lat: true,
  lng: true,
  notes: true,
  archivedAt: true,
} as const;

type PlaceRow = {
  id: string;
  name: string;
  kind: string;
  address: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  archivedAt: Date | null;
};

export function serializePlace(p: PlaceRow): PlaceDTO {
  return {
    id: p.id,
    name: p.name,
    kind: (PLACE_KINDS as readonly string[]).includes(p.kind) ? (p.kind as PlaceKind) : "OTHER",
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    notes: p.notes,
    archived: p.archivedAt != null,
  };
}

export type PlaceInput = { name: string; kind: PlaceKind; address: string; notes: string | null };

/** Pure: a request body → column values, or the one thing wrong with it. */
export function parsePlaceInput(body: Record<string, unknown>, partial = false): Partial<PlaceInput> | { error: string } {
  const out: Partial<PlaceInput> = {};
  if (body.name !== undefined || !partial) {
    const name = typeof body.name === "string" ? body.name.trim().slice(0, PLACE_NAME_MAX) : "";
    if (!name) return { error: "Give the place a name." };
    out.name = name;
  }
  if (body.kind !== undefined || !partial) {
    const kind = typeof body.kind === "string" ? body.kind.toUpperCase() : "OTHER";
    if (!(PLACE_KINDS as readonly string[]).includes(kind)) return { error: "That kind of place doesn't exist." };
    out.kind = kind as PlaceKind;
  }
  if (body.address !== undefined || !partial) {
    const address = typeof body.address === "string" ? body.address.trim().slice(0, PLACE_ADDRESS_MAX) : "";
    if (!address) return { error: "A place needs an address." };
    out.address = address;
  }
  if (body.notes !== undefined) {
    out.notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, PLACE_NOTES_MAX) : null;
  }
  return out;
}

/** Active places for a company, supply houses first, then by name. */
export async function listPlaces(companyId: string, includeArchived = false): Promise<PlaceDTO[]> {
  const rows = await prisma.place.findMany({
    where: { companyId, ...(includeArchived ? {} : { archivedAt: null }) },
    select: placeSelect,
    orderBy: [{ archivedAt: "asc" }, { name: "asc" }],
    take: 200,
  });
  return rows.map(serializePlace);
}

/** One place the company owns (archived included — a stop may still point at it), or null. */
export async function findPlace(companyId: string, id: string) {
  return prisma.place.findFirst({ where: { id, companyId }, select: placeSelect });
}

/** Geocode an address for a place; a miss keeps the text and leaves the pin empty. */
export async function placePin(address: string, companyId: string): Promise<{ lat: number | null; lng: number | null }> {
  const hit = await geocodeAddress(address, companyId);
  return { lat: hit?.lat ?? null, lng: hit?.lng ?? null };
}
