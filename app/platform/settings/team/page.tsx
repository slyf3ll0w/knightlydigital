import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { sanitizeBusinessHours, sanitizeWorkingHoursOrNull } from "@/lib/business-hours";
import { loadElsewhere, presenceOf, relativeSeen } from "@/lib/presence";
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
        accountId: true,
        lastSeenAt: true,
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    }),
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { defaultLeadUserId: true, salesSeePayments: true, businessHours: true, timezone: true },
    }),
  ]);

  // Online / last seen (David 2026-10-02), from the same heartbeat as the
  // platform console (lib/presence.ts). Someone on one login who is using
  // another company right now is simply not online here; which company is
  // never shown to this one.
  const now = new Date();
  const elsewhere = await loadElsewhere(users, now);
  const seenOf = (u: (typeof users)[number]) => {
    const state = presenceOf(u.lastSeenAt, company?.timezone ?? "America/Chicago", now, elsewhere.has(u.id));
    return {
      state,
      label: state === "online" ? "Online now" : state === "never" ? "Never signed in" : `Last seen ${relativeSeen(u.lastSeenAt, now)}`,
    };
  };
  const seen = new Map(users.map((u) => [u.id, seenOf(u)]));

  return (
    <TeamClient
      actorId={actor.id}
      actorRole={actor.role}
      users={users.map(({ accountId: _accountId, lastSeenAt: _lastSeenAt, ...u }) => ({
        ...u,
        seen: seen.get(u.id)!,
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
