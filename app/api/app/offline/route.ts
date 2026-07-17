import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";

/**
 * The offline warm list: pages worth caching before the user loses signal.
 * OfflineSupport fetches this and hands the URLs to the service worker, which
 * pulls each page into the offline snapshot in the background. Role-scoped
 * like the pages themselves (techs warm their own jobs, not the company's).
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = jobScope(actor);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfTomorrow = new Date(startOfToday.getTime() + 48 * 60 * 60 * 1000);

  const [scheduled, recentActive] = await Promise.all([
    // Today's and tomorrow's schedule — the pages a tech needs in the field
    prisma.job.findMany({
      where: {
        companyId: actor.companyId,
        ...scope,
        scheduledAt: { gte: startOfToday, lt: endOfTomorrow },
      },
      select: { id: true },
      orderBy: { scheduledAt: "asc" },
      take: 30,
    }),
    // Plus recently touched active jobs (covers unscheduled work in progress)
    prisma.job.findMany({
      where: { companyId: actor.companyId, ...scope, status: "ACTIVE" },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const urls = new Set<string>(["/app/dashboard", "/app/jobs", "/app/schedule", "/app/contacts"]);
  for (const job of [...scheduled, ...recentActive]) urls.add(`/app/jobs/${job.id}`);

  return NextResponse.json({ urls: [...urls] });
}
