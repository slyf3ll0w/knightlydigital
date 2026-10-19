import type { Metadata } from "next";
import { isManager, requirePageActor } from "@/lib/permissions";
import { listPlaces } from "@/lib/places";
import PlacesClient from "./PlacesClient";

export const metadata: Metadata = { title: "Places" };

/**
 * Places — the spots the crew drives to that aren't clients (supply
 * houses, the dump, the yard). Everyone can see and add them; managers
 * archive. Picked from "Add a stop" on the Routes page.
 */
export default async function PlacesPage() {
  const actor = await requirePageActor();
  const places = await listPlaces(actor.companyId, isManager(actor.role));
  return <PlacesClient initial={places} canArchive={isManager(actor.role)} />;
}
