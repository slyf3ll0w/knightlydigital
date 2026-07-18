import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isRoadmapEditor } from "@/lib/roadmap";
import RoadmapClient from "./RoadmapClient";

export const metadata: Metadata = {
  title: "Upcoming Features",
  description:
    "What we're building next for WorkBench — upcoming features, bug fixes, and quality-of-life improvements, and everything that already shipped.",
};

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
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
    />
  );
}
