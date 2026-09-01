import { prisma } from "@/lib/db";
import ApplicationsClient from "./ApplicationsClient";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const applications = await prisma.accessApplication.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      inviteCode: { select: { code: true, usedAt: true } },
      company: {
        select: { id: true, name: true, suspendedAt: true, finixOnboardingState: true },
      },
    },
  });

  return (
    <ApplicationsClient
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
          ? {
              id: a.company.id,
              name: a.company.name,
              suspended: !!a.company.suspendedAt,
              finixState: a.company.finixOnboardingState,
            }
          : null,
      }))}
    />
  );
}
