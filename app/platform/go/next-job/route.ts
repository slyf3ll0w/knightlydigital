import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { startOfDayIn } from "@/lib/timezone";

/**
 * GET /app/go/next-job — resolve "my next job" and bounce there.
 *
 * A stable deep link for launchers that can only open a URL: Siri Shortcuts
 * ("Hey Siri, next job" → Open URL), Android home-screen shortcuts, the
 * native shell's app-shortcut menu. Picks my next upcoming scheduled job
 * (today's anytime jobs count), else the job I'm clocked into, else the
 * schedule. Unauthenticated hits ride the normal middleware login redirect.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));

  const actor = await getActor();
  if (!actor) return to("/app/login");

  // "Today" is the company's day, not the UTC server's — at 7pm Central the
  // server is already on tomorrow, which used to drop the evening's jobs.
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true },
  });
  const tz = company?.timezone ?? "America/Chicago";
  const now = new Date();
  const startOfDay = startOfDayIn(tz, now);

  const [openEntry, next] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: { userId: actor.id, endedAt: null },
      select: { jobId: true },
    }),
    prisma.job.findFirst({
      where: {
        companyId: actor.companyId,
        ...jobScope(actor),
        status: "ACTIVE",
        // Anytime jobs sit at noon; still today's work even late in the day
        scheduledAt: { gte: startOfDay },
        OR: [
          { assignments: { some: { userId: actor.id } } },
          { assignments: { none: {} } },
        ],
      },
      orderBy: { scheduledAt: "asc" },
      select: { id: true },
    }),
  ]);

  // Mid-job beats up-next: "next job" while on a clock means "my job"
  if (openEntry?.jobId) return to(`/app/jobs/${openEntry.jobId}`);
  if (next) return to(`/app/jobs/${next.id}`);
  return to("/app/schedule");
}
