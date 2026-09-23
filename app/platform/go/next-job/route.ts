import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { resolveNextJob } from "@/lib/next-job";

/**
 * GET /app/go/next-job — resolve "my next job" and bounce there.
 *
 * A stable deep link for launchers that can only open a URL: Siri Shortcuts
 * ("Hey Siri, next job" → Open URL), the iPhone's App Intents, Android
 * home-screen shortcuts, the native shell's app-shortcut menu. The job I'm
 * clocked into, else my next upcoming scheduled job, else the schedule
 * (lib/next-job.ts). Unauthenticated hits ride the normal middleware login
 * redirect.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, req.nextUrl.origin));
  const actor = await getActor();
  if (!actor) return to("/app/login");
  const job = await resolveNextJob(actor);
  return to(job ? `/app/jobs/${job.id}` : "/app/schedule");
}
