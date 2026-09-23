import { NextResponse } from "next/server";
import { getActor } from "@/lib/permissions";
import { companyTimezone, todaysJobs } from "@/lib/next-job";

/**
 * GET — "what's my day look like", already in words: Siri reads `summary`
 * aloud. The server writes the sentence because it knows the company's
 * timezone and which jobs are date-only (they sit at noon and are read as
 * "anytime").
 */
export const dynamic = "force-dynamic";

function timeLabel(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  const ap = (parts.find((p) => p.type === "dayPeriod")?.value ?? "").toLowerCase();
  if (h === "12" && m === "00" && ap === "pm") return "anytime";
  return m === "00" ? `${h} ${ap}` : `${h}:${m} ${ap}`;
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tz = await companyTimezone(actor.companyId);
  const jobs = await todaysJobs(actor, tz);

  const lines = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    client: j.contact.firstName,
    time: j.scheduledAt ? timeLabel(j.scheduledAt, tz) : "anytime",
  }));

  let summary: string;
  if (lines.length === 0) summary = "Nothing on the schedule today.";
  else {
    const spoken = lines.map((l) => `${l.time}, ${l.title} for ${l.client}`);
    summary =
      lines.length === 1
        ? `One job today: ${spoken[0]}.`
        : `${lines.length} jobs today: ${spoken.slice(0, -1).join("; ")}; and ${spoken[spoken.length - 1]}.`;
  }

  return NextResponse.json({ jobs: lines, summary }, { headers: { "Cache-Control": "no-store" } });
}
