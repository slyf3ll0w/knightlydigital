import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import ContactClient from "./ContactClient";

export const dynamic = "force-dynamic";

/**
 * Messages from the marketing site's "Contact us" form (ContactSubmission).
 * Opening the page marks the unread ones read (that clears the rail badge);
 * they still wear a "New" chip for this visit.
 */
export default async function SuperadminContactPage() {
  await requireSuperadminPage();

  const rows = await prisma.contactSubmission.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      businessName: true,
      message: true,
      pageUrl: true,
      spam: true,
      readAt: true,
      createdAt: true,
    },
  });

  const fresh = rows.filter((r) => !r.readAt && !r.spam).map((r) => r.id);
  if (fresh.length) {
    await prisma.contactSubmission.updateMany({ where: { id: { in: fresh } }, data: { readAt: new Date() } });
  }

  return (
    <ContactClient
      submissions={rows.map((r) => ({ ...r, readAt: undefined, createdAt: r.createdAt.toISOString(), isNew: fresh.includes(r.id) }))}
    />
  );
}
