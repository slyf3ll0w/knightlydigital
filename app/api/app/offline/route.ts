import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { startOfDayIn } from "@/lib/timezone";

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
  // Company-local midnight — the server's own clock is UTC.
  const company = await prisma.company.findUnique({
    where: { id: actor.companyId },
    select: { timezone: true },
  });
  const tz = company?.timezone ?? "America/Chicago";
  const startOfToday = startOfDayIn(tz, new Date());
  const endOfTomorrow = new Date(startOfToday.getTime() + 48 * 60 * 60 * 1000);

  // Today's and tomorrow's schedule — the pages a tech needs in the field.
  // Deliberately small: every URL here is a full server render the phone
  // downloads in the background right after opening the app, competing with
  // whatever the user actually tapped. (Recently-touched active jobs used to
  // ride along too — they're reachable online and not worth the bandwidth.)
  const scheduled = await prisma.job.findMany({
    where: {
      companyId: actor.companyId,
      ...scope,
      scheduledAt: { gte: startOfToday, lt: endOfTomorrow },
    },
    select: { id: true },
    orderBy: { scheduledAt: "asc" },
    take: 16,
  });

  const urls = new Set<string>(["/app/dashboard", "/app/jobs", "/app/schedule", "/app/contacts"]);
  for (const job of scheduled) urls.add(`/app/jobs/${job.id}`);

  return NextResponse.json({ urls: [...urls] });
}
