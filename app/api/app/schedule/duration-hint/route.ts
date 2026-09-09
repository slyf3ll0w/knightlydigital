import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";

/**
 * GET /api/app/schedule/duration-hint?title= — how long this kind of work
 * usually takes for THIS company, so the schedule sheet defaults to a real
 * number instead of a flat hour.
 *
 * Learned from, in order of trust:
 *   1. actual clock time — TimeEntry spans on past jobs with the same title
 *   2. what was scheduled — scheduledEnd − scheduledAt on those jobs
 *   3. the price book — WorkItem.durationMinutes for a service of that name
 * Median, rounded to 15 minutes. `null` when nothing matches.
 */
export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const title = (req.nextUrl.searchParams.get("title") ?? "").trim().slice(0, 120);
  if (title.length < 2) return NextResponse.json({ minutes: null, source: null, samples: 0 });
  const companyId = actor.companyId;
  const match = { equals: title, mode: "insensitive" as const };

  const jobs = await prisma.job.findMany({
    where: { companyId, title: match, scheduledAt: { not: null } },
    select: {
      scheduledAt: true,
      scheduledEnd: true,
      scheduledAnytime: true,
      timeEntries: { select: { startedAt: true, endedAt: true }, where: { endedAt: { not: null } } },
    },
    orderBy: { scheduledAt: "desc" },
    take: 25,
  });

  const median = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  const round15 = (m: number) => Math.max(15, Math.round(m / 15) * 15);

  // 1. Actual time on the clock (sum of a job's spans, sane range only)
  const actual = jobs
    .map((j) =>
      j.timeEntries.reduce(
        (s, t) => s + (t.endedAt!.getTime() - t.startedAt.getTime()) / 60000,
        0
      )
    )
    .filter((m) => m >= 10 && m <= 12 * 60);
  const a = median(actual);
  if (a !== null && actual.length >= 2) {
    return NextResponse.json({ minutes: round15(a), source: "actual", samples: actual.length });
  }

  // 2. What was booked last time(s)
  const booked = jobs
    .filter((j) => !j.scheduledAnytime && j.scheduledEnd)
    .map((j) => (j.scheduledEnd!.getTime() - j.scheduledAt!.getTime()) / 60000)
    .filter((m) => m >= 10 && m <= 12 * 60);
  const b = median(booked);
  if (b !== null) {
    return NextResponse.json({ minutes: round15(b), source: "scheduled", samples: booked.length });
  }

  // 3. The price book
  const item = await prisma.workItem.findFirst({
    where: { companyId, name: match, durationMinutes: { not: null } },
    select: { durationMinutes: true },
  });
  if (item?.durationMinutes) {
    return NextResponse.json({ minutes: round15(item.durationMinutes), source: "service", samples: 1 });
  }

  return NextResponse.json({ minutes: null, source: null, samples: 0 });
}
