import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { geocodeAddress } from "@/lib/geocoding";
import { driveTimeMatrix } from "@/lib/routing";

// Logs that an "on my way" text was handed off to the sender's Messages app —
// stamps the job and drops a line in Notes & Activity so the office can see it.
// The text itself goes out from the tech's own phone (see lib/messaging.ts).
//
// When the tech's device shares its position ({ lat, lng } in the body), the
// response includes a real drive-time ETA to the job site (Mapbox matrix, or
// the haversine estimate when the token/budget is out) — the client fills it
// into the {{eta}} placeholder before opening Messages. Jobber makes techs
// pick a canned "20 minutes"; we compute it.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const job = await prisma.job.findFirst({
    where: { id, companyId: actor.companyId, ...jobScope(actor) },
    include: { contact: { select: { firstName: true } } },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const lat = Number((body as Record<string, unknown>).lat);
  const lng = Number((body as Record<string, unknown>).lng);

  let etaMinutes: number | null = null;
  if (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    job.address
  ) {
    const dest = await geocodeAddress(job.address, actor.companyId);
    if (dest) {
      try {
        const matrix = await driveTimeMatrix([{ lat, lng }, dest], actor.companyId);
        const minutes = matrix[0][1];
        if (Number.isFinite(minutes) && minutes >= 0) etaMinutes = Math.round(minutes);
      } catch {
        // ETA is a nicety — the text still goes out without one
      }
    }
  }

  const sentAt = new Date();
  await Promise.all([
    prisma.job.update({ where: { id }, data: { onMyWaySentAt: sentAt } }),
    prisma.jobNote.create({
      data: {
        jobId: id,
        userId: actor.id,
        body: `Sent ${job.contact.firstName} an "on my way" text${
          etaMinutes != null ? ` (ETA ~${etaMinutes} min)` : ""
        }.`,
      },
    }),
  ]);

  return NextResponse.json({ success: true, sentAt: sentAt.toISOString(), etaMinutes });
}
