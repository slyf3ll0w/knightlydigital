import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor } from "@/lib/permissions";
import { isRoadmapEditor } from "@/lib/roadmap";
import RoadmapClient from "@/app/roadmap/RoadmapClient";

export const metadata: Metadata = { title: "Upcoming Features" };

/**
 * In-app view of the public roadmap (/app/roadmap) — same board, rendered
 * inside the app shell instead of the marketing chrome. Reached from the
 * dashboard footer link; deliberately absent from the sidebar.
 */
export default async function AppRoadmapPage() {
  await requirePageActor();
  const canEdit = await isRoadmapEditor();
  const items = await prisma.roadmapItem.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });

  return (
    <RoadmapClient
      initialItems={JSON.parse(
        // Private notes never leave the server for non-editors
        JSON.stringify(canEdit ? items : items.map(({ privateNotes: _, ...rest }) => rest))
      )}
      canEdit={canEdit}
      app
    />
  );
}
