import { NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { resolveNextJob } from "@/lib/next-job";

/**
 * GET — "my next job" as JSON, for the iPhone's Siri intents
 * (ios/App/App/Intents.swift). Siri asks this, then clocks in or out on
 * the job through POST /api/app/jobs/[id]/clock like any other client. The
 * cookie the app's webview holds is what authenticates the request; a
 * signed-out phone gets a 401 and Siri says to open the app.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ job: null, reason: "role" });
  const job = await resolveNextJob(actor);
  return NextResponse.json({ job }, { headers: { "Cache-Control": "no-store" } });
}
