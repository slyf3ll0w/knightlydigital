import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isRoadmapEditor } from "@/lib/roadmap";
import RoadmapClient from "./RoadmapClient";

export const metadata: Metadata = {
  title: "Upcoming Features — Streamflaire Hub",
  description:
    "What we're building next for Streamflaire Hub — upcoming features, bug fixes, and quality-of-life improvements, and everything that already shipped.",
};

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const [items, canEdit] = await Promise.all([
    prisma.roadmapItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    }),
    isRoadmapEditor(),
  ]);

  return (
    <RoadmapClient
      initialItems={JSON.parse(JSON.stringify(items))}
      canEdit={canEdit}
    />
  );
}
