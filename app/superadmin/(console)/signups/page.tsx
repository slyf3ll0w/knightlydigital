import { prisma } from "@/lib/db";
import SignupsClient from "@/components/console/SignupsClient";

export const dynamic = "force-dynamic";

/**
 * Sign-ups: the front door in one place — access applications waiting on a
 * decision, and the invite codes that let someone skip the line. (Was two
 * pages, Applications and Invite codes, until 2026-09-30.)
 */
export default async function SignupsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [applications, invites] = await Promise.all([
    prisma.accessApplication.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        inviteCode: { select: { code: true, usedAt: true } },
        company: { select: { id: true, name: true, suspendedAt: true, finixOnboardingState: true } },
      },
    }),
    prisma.inviteCode.findMany({
      orderBy: { createdAt: "desc" },
      include: { usedByCompany: { select: { id: true, name: true } }, application: { select: { companyName: true } } },
    }),
  ]);

  return (
    <SignupsClient
      tab={tab === "invites" ? "invites" : "applications"}
      applications={applications.map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        phone: a.phone,
        companyName: a.companyName,
        industry: a.industry,
        teamSize: a.teamSize,
        city: a.city,
        state: a.state,
        paymentsToday: a.paymentsToday,
        monthlyVolume: a.monthlyVolume,
        yearsInBusiness: a.yearsInBusiness,
        entityType: a.entityType,
        website: a.website,
        message: a.message,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() ?? null,
        inviteCode: a.inviteCode ? { code: a.inviteCode.code, used: !!a.inviteCode.usedAt } : null,
        company: a.company
          ? { id: a.company.id, name: a.company.name, suspended: !!a.company.suspendedAt, finixState: a.company.finixOnboardingState }
          : null,
      }))}
      invites={invites.map((i) => ({
        id: i.id,
        code: i.code,
        note: i.note,
        email: i.email,
        createdAt: i.createdAt.toISOString(),
        expiresAt: i.expiresAt?.toISOString() ?? null,
        usedAt: i.usedAt?.toISOString() ?? null,
        revokedAt: i.revokedAt?.toISOString() ?? null,
        usedByCompany: i.usedByCompany ? { id: i.usedByCompany.id, name: i.usedByCompany.name } : null,
        applicationCompany: i.application?.companyName ?? null,
      }))}
    />
  );
}
