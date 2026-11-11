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
  const [applications, invites, companyRequests] = await Promise.all([
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
    prisma.companyRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        company: { select: { id: true, name: true } },
        account: {
          select: {
            email: true,
            users: {
              where: { isActive: true, companyId: { not: null }, role: { not: "SUPERADMIN" } },
              select: { company: { select: { id: true, name: true } } },
            },
          },
        },
      },
    }),
  ]);

  return (
    <SignupsClient
      tab={
        tab === "invites"
          ? "invites"
          : tab === "companies" ||
              // The rail badge links here with no tab: land on whatever is waiting.
              (!tab && !applications.some((a) => a.status === "PENDING") && companyRequests.some((r) => r.status === "PENDING"))
            ? "companies"
            : "applications"
      }
      companyRequests={companyRequests.map((r) => ({
        id: r.id,
        companyName: r.companyName,
        industry: r.industry,
        note: r.note,
        requesterName: r.requesterName,
        email: r.account.email,
        currentCompanies: r.account.users
          .map((u) => u.company)
          .filter((c): c is { id: string; name: string } => Boolean(c) && c!.id !== r.companyId),
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt?.toISOString() ?? null,
        decidedBy: r.decidedBy,
        company: r.company,
      }))}
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
