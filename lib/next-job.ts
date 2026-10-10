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
  /** The client's number — Siri hands a call or text to the phone itself when the company has no business line. */
  contactPhone: string | null;
  scheduledAt: Date | null;
  /** Job address, else the client's — where "directions to my next job" goes. */
  address: string | null;
  /** When the open time entry started; only set while clockedIn. */
  onClockSince: Date | null;
};

const jobSelect = {
  id: true,
  title: true,
  contactId: true,
  scheduledAt: true,
  address: true,
  contact: { select: { firstName: true, phone: true, address: true } },
} as const;

type JobRow = {
  id: string;
  title: string;
  contactId: string;
  scheduledAt: Date | null;
  address: string | null;
  contact: { firstName: string; phone: string | null; address: string | null };
};

const shape = (j: JobRow, onClockSince: Date | null): NextJob => ({
  id: j.id,
  title: j.title,
  clockedIn: onClockSince !== null,
  contactId: j.contactId,
  contactFirstName: j.contact.firstName,
  contactPhone: j.contact.phone,
  scheduledAt: j.scheduledAt,
  address: j.address ?? j.contact.address ?? null,
  onClockSince,
});

/** "2:30 pm" / "9 am" in the company's zone; a date-only job sits at noon and reads as "anytime". */
export function timeLabel(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  const ap = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toLowerCase();
  if (h === "12" && m === "00" && ap === "pm") return "anytime";
  return m === "00" ? `${h} ${ap}` : `${h}:${m} ${ap}`;
}

/**
 * When a job is, in words Siri can read: "today at 2:30 pm", "anytime
 * today", "tomorrow at 9 am", "Thursday at 1 pm", "October 24th at 10 am".
 */
export function spokenWhen(scheduledAt: Date | null, tz: string, now: Date = new Date()): string {
  if (!scheduledAt) return "not scheduled yet";
  const dayStart = startOfDayIn(tz, now).getTime();
  const day = 24 * 60 * 60 * 1000;
  const t = scheduledAt.getTime();
  const time = timeLabel(scheduledAt, tz);
  const at = (dayWord: string) => (time === "anytime" ? `anytime ${dayWord}` : `${dayWord} at ${time}`);
  if (t >= dayStart && t < dayStart + day) return at("today");
  if (t >= dayStart + day && t < dayStart + 2 * day) return at("tomorrow");
  if (t >= dayStart && t < dayStart + 7 * day) {
    return at(new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long" }).format(scheduledAt));
  }
  const date = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long", day: "numeric" }).format(scheduledAt);
  return at(date);
}

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
      select: { startedAt: true, job: { select: jobSelect } },
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
  if (openEntry?.job) return shape(openEntry.job, openEntry.startedAt);
  if (next) return shape(next, null);
  return null;
}
