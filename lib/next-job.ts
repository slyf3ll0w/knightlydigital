import { prisma } from "@/lib/db";
import { jobScope, type Actor } from "@/lib/permissions";
import { startOfDayIn } from "@/lib/timezone";

/**
 * "My next job" — the one answer behind the /app/go/next-job deep link,
 * the Siri intents (ios/App/App/Intents.swift) and anything else that can
 * only ask a yes/no question: the job I'm clocked into, else my next
 * upcoming scheduled job (today's anytime jobs count), else nothing.
 */
export type NextJob = {
  id: string;
  title: string;
  /** True when this is the job the person is clocked into right now. */
  clockedIn: boolean;
};

export async function resolveNextJob(actor: Pick<Actor, "id" | "companyId" | "role">): Promise<NextJob | null> {
  // "Today" is the company's day, not the UTC server's — at 7pm Central the
  // server is already on tomorrow, which used to drop the evening's jobs.
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true },
  });
  const tz = company?.timezone ?? "America/Chicago";
  const startOfDay = startOfDayIn(tz, new Date());

  const select = { id: true, title: true } as const;
  const [openEntry, next] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: { userId: actor.id, endedAt: null },
      select: { job: { select } },
    }),
    prisma.job.findFirst({
      where: {
        companyId: actor.companyId,
        ...jobScope(actor as Actor),
        status: "ACTIVE",
        // Anytime jobs sit at noon; still today's work even late in the day
        scheduledAt: { gte: startOfDay },
        OR: [{ assignments: { some: { userId: actor.id } } }, { assignments: { none: {} } }],
      },
      orderBy: { scheduledAt: "asc" },
      select,
    }),
  ]);

  // Mid-job beats up-next: "next job" while on a clock means "my job"
  if (openEntry?.job) return { id: openEntry.job.id, title: openEntry.job.title, clockedIn: true };
  if (next) return { id: next.id, title: next.title, clockedIn: false };
  return null;
}
