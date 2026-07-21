import { prisma } from "@/lib/db";
import InvitesClient from "./InvitesClient";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const invites = await prisma.inviteCode.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      usedByCompany: { select: { name: true } },
      application: { select: { companyName: true } },
    },
  });

  return (
    <InvitesClient
      invites={invites.map((i) => ({
        id: i.id,
        code: i.code,
        note: i.note,
        email: i.email,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt?.toISOString() ?? null,
        usedAt: i.usedAt?.toISOString() ?? null,
        revokedAt: i.revokedAt?.toISOString() ?? null,
        usedByCompany: i.usedByCompany?.name ?? null,
        applicationCompany: i.application?.companyName ?? null,
      }))}
    />
  );
}
