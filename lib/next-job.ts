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
  contactId: string;
  contactFirstName: string;
  scheduledAt: Date | null;
};

const jobSelect = {
  id: true,
  title: true,
  contactId: true,
  scheduledAt: true,
  contact: { select: { firstName: true } },
} as const;

type JobRow = { id: string; title: string; contactId: string; scheduledAt: Date | null; contact: { firstName: string } };

const shape = (j: JobRow, clockedIn: boolean): NextJob => ({
  id: j.id,
  title: j.title,
  clockedIn,
  contactId: j.contactId,
  contactFirstName: j.contact.firstName,
  scheduledAt: j.scheduledAt,
});

export async function companyTimezone(companyId: string): Promise<string> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } });
  return company?.timezone ?? "America/Chicago";
}

/** The jobs on my plate today, in order — the schedule Siri reads back. */
export async function todaysJobs(actor: Pick<Actor, "id" | "companyId" | "role">, tz: string): Promise<JobRow[]> {
  const start = startOfDayIn(tz, new Date());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return prisma.job.findMany({
    where: {
      companyId: actor.companyId,
      ...jobScope(actor as Actor),
      status: "ACTIVE",
      scheduledAt: { gte: start, lt: end },
      OR: [{ assignments: { some: { userId: actor.id } } }, { assignments: { none: {} } }],
    },
    orderBy: { scheduledAt: "asc" },
    select: jobSelect,
  });
}

export async function resolveNextJob(actor: Pick<Actor, "id" | "companyId" | "role">): Promise<NextJob | null> {
  // "Today" is the company's day, not the UTC server's — at 7pm Central the
  // server is already on tomorrow, which used to drop the evening's jobs.
  const tz = await companyTimezone(actor.companyId);
  const startOfDay = startOfDayIn(tz, new Date());

  const [openEntry, next] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: { userId: actor.id, endedAt: null },
      select: { job: { select: jobSelect } },
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
      select: jobSelect,
    }),
  ]);

  // Mid-job beats up-next: "next job" while on a clock means "my job"
  if (openEntry?.job) return shape(openEntry.job, true);
  if (next) return shape(next, false);
  return null;
}
