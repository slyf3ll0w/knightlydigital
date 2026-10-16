"use client";

import { postJson } from "@/lib/safe-fetch";
import { newServicesFrom, type ServiceLine } from "@/lib/new-services";

/**
 * After a quote / invoice / job saved: add its typed, priced lines to the
 * price book (lib/new-services.ts picks which). Best effort — a seller
 * without the Services permission gets a 403 and nothing else changes, and
 * the record they just saved is already stored. Runs the POSTs together and
 * resolves when they settle; callers may `void` it.
 */
export async function saveNewServices(lines: ServiceLine[], existing: { name: string }[]): Promise<void> {
  const fresh = newServicesFrom(lines, existing);
  if (fresh.length === 0) return;
  await Promise.allSettled(
    fresh.map((s) =>
      postJson("/api/app/work-items", {
        name: s.name,
        description: s.description,
        type: "SERVICE",
        unitPrice: s.unitPrice,
        unitCost: s.unitCost,
      })
    )
  );
}
