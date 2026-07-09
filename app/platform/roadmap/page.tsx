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
  const [items, notes] = await Promise.all([
    prisma.roadmapItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    // Private notes never leave the server for non-editors
    prisma.roadmapNote.findMany({
      where: canEdit ? {} : { isPublic: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <RoadmapClient
      initialItems={JSON.parse(JSON.stringify(items))}
      initialNotes={JSON.parse(JSON.stringify(notes))}
      canEdit={canEdit}
      app
    />
  );
}
