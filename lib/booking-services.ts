import type { LoadedBookingType } from "@/lib/booking-runtime";
import { activeServices } from "@/lib/booking-runtime";

/**
 * SERVICE booking types: resolve the customer's picks (comma-separated
 * work-item ids from the query / body) against the type's active services.
 * Duration = sum of the picked items' time on site (fallback: the type's own
 * duration for items with none); price = sum of unit prices.
 */
export type ServiceSelection = {
  items: LoadedBookingType["services"][number]["workItem"][];
  durationMinutes: number;
  total: number;
  /** Every pick is a fixed price → chargeable at booking. */
  allFixed: boolean;
  names: string[];
};

export function serviceSelection(type: LoadedBookingType, raw: unknown): ServiceSelection | null {
  const ids = (Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (ids.length === 0) return null;
  const byId = new Map(activeServices(type).map((s) => [s.workItem.id, s.workItem]));
  const items = [...new Set(ids)].map((id) => byId.get(id)).filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (items.length === 0) return null;
  const durationMinutes = items.reduce((sum, w) => sum + (w.durationMinutes ?? type.durationMinutes), 0);
  const total = Math.round(items.reduce((sum, w) => sum + Number(w.unitPrice), 0) * 100) / 100;
  return {
    items,
    durationMinutes: Math.max(15, Math.min(12 * 60, durationMinutes)),
    total,
    allFixed: items.every((w) => w.priceDisplay === "FIXED"),
    names: items.map((w) => w.name),
  };
}
