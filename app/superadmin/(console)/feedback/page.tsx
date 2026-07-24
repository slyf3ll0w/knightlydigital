import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import FeedbackClient from "./FeedbackClient";

export const dynamic = "force-dynamic";

/**
 * Support & suggestion tickets from tenant users. Approving one posts an
 * editable copy onto the public Upcoming Features board (RoadmapItem);
 * resolve/decline just close it with an optional reply the submitter sees.
 */
export default async function SuperadminFeedbackPage() {
  await requireSuperadminPage();

  const tickets = await prisma.feedbackTicket.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      user: { select: { name: true, email: true } },
      company: { select: { id: true, name: true } },
      roadmapItem: { select: { id: true, title: true, shippedAt: true } },
    },
  });

  return <FeedbackClient tickets={JSON.parse(JSON.stringify(tickets))} />;
}
