import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { sanitizeBusinessHours, sanitizeWorkingHoursOrNull } from "@/lib/business-hours";
import TeamClient from "./TeamClient";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const [users, company] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: actor.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        bookable: true,
        workingHours: true,
      meetingLink: true,
      startAddress: true,
        hourlyCost: true,
        createdAt: true,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { defaultLeadUserId: true, salesSeePayments: true, businessHours: true },
    }),
  ]);

  return (
    <TeamClient
      actorId={actor.id}
      actorRole={actor.role}
      users={users.map((u) => ({
        ...u,
        workingHours: sanitizeWorkingHoursOrNull(u.workingHours),
        meetingLink: u.meetingLink,
        startAddress: u.startAddress,
        hourlyCost: u.hourlyCost != null ? Number(u.hourlyCost) : null,
        createdAt: u.createdAt.toISOString(),
      }))}
      companyHours={sanitizeBusinessHours(company?.businessHours)}
      defaultLeadUserId={company?.defaultLeadUserId ?? ""}
      salesSeePayments={company?.salesSeePayments ?? true}
    />
  );
}
