/**
 * Place types and constants safe for client components (no Prisma). The
 * server side (lib/places.ts) re-exports everything here.
 */

export const PLACE_KINDS = ["SUPPLY", "DUMP", "SHOP", "YARD", "OTHER"] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

export const PLACE_KIND_LABELS: Record<PlaceKind, string> = {
  SUPPLY: "Supply house",
  DUMP: "Dump / transfer station",
  SHOP: "Shop / office",
  YARD: "Yard / storage",
  OTHER: "Other",
};

export const PLACE_NAME_MAX = 80;
export const PLACE_ADDRESS_MAX = 240;
export const PLACE_NOTES_MAX = 500;

export type PlaceDTO = {
  id: string;
  name: string;
  kind: PlaceKind;
  address: string;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  archived: boolean;
};
