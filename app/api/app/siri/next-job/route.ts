import { NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { companyTimezone, resolveNextJob, spokenWhen } from "@/lib/next-job";
import { formatDuration } from "@/lib/time-entries";

/**
 * GET — "my next job" as JSON, for the iPhone's Siri intents
 * (ios/App/App/Intents.swift). Siri asks this, then clocks in or out,
 * completes, calls or texts the client, or opens directions — each through
 * the same routes the app uses. `when` and `onClock` are already words
 * ("tomorrow at 9 am", "1h 20m") because the server knows the company's
 * timezone. The cookie the app's webview holds is what authenticates the
 * request; a signed-out phone gets a 401 and Siri says to open the app.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ job: null, reason: "role" });
  const job = await resolveNextJob(actor);
  if (!job) return NextResponse.json({ job: null }, { headers: { "Cache-Control": "no-store" } });
  const tz = await companyTimezone(actor.companyId);
  const now = new Date();
  return NextResponse.json(
    {
      job: {
        ...job,
        when: spokenWhen(job.scheduledAt, tz, now),
        onClock: job.onClockSince ? formatDuration(now.getTime() - job.onClockSince.getTime()) : null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
