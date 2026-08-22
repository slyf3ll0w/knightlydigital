import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

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

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

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
