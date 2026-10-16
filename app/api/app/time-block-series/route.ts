import { NextRequest, NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { createSeriesFromBody, listSeries, toSeriesDTO } from "@/lib/time-block-series";

/**
 * Repeating blocked time ("lunch every weekday", "Fridays off").
 *
 * GET  — every series in the company (the settings list).
 * POST — create one and build its occurrences a year ahead. Body:
 *   { title?, forUserId? (managers; null = everyone), address?,
 *     weekdays: number[] (0 = Sun), allDay?, startTime?, endTime? ("HH:MM"),
 *     startsOn: "YYYY-MM-DD", endsOn?: "YYYY-MM-DD" | null }
 * Same permissions as one-off blocks: everyone for themselves, owners and
 * admins for anyone or the whole company.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ series: await listSeries(actor) });
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const out = await createSeriesFromBody(actor, body, new Date());
  if (!out.ok) return NextResponse.json({ error: out.error }, { status: out.status });
  return NextResponse.json({ ...toSeriesDTO(out.series, actor), created: out.created }, { status: 201 });
}
