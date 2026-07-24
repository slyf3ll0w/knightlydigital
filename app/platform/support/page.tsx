import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor } from "@/lib/permissions";
import SupportClient from "./SupportClient";

export const metadata: Metadata = { title: "Help & Feedback" };

/**
 * Help & feedback (/app/support) — where any signed-in user reports a bug or
 * suggests a feature, and follows what happened to their past tickets.
 * Approved suggestions become items on the Upcoming Features board.
 */
export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const actor = await requirePageActor();
  const { type } = await searchParams;

  const tickets = await prisma.feedbackTicket.findMany({
    where: { companyId: actor.companyId, userId: actor.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      type: true,
      status: true,
      title: true,
      details: true,
      response: true,
      roadmapItemId: true,
      createdAt: true,
    },
  });

  return (
    <SupportClient
      initialTickets={JSON.parse(JSON.stringify(tickets))}
      initialType={type === "BUG" || type === "SUGGESTION" ? type : null}
    />
  );
}
