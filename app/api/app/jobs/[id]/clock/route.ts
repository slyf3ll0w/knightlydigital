import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, jobScope } from "@/lib/permissions";
import { formatDuration, resolveOccurredAt, sanitizeGps } from "@/lib/time-entries";

/**
 * Clock in / clock out on a job. Techs and managers alike — anyone who can
 * see the job can log time on it (sales can't; they don't work jobs).
 *
 * Body: { action: "in" | "out", clientKey?, occurredAt?, lat?, lng?, accuracy? }
 * - clientKey: client-generated id; a retried/queued tap with the same key
 *   returns the original entry instead of double-creating.
 * - occurredAt: tap-time from the device (clamped server-side) so a delayed
 *   request doesn't shift the timestamp.
 * - lat/lng/accuracy: optional one-shot GPS stamp captured at the tap.
 *
 * A user has at most one open entry: clocking in anywhere auto-closes any
 * still-open entry first (techs forget to clock out).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role === "SALES") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action === "out" ? "out" : body.action === "in" ? "in" : null;
  if (!action) return NextResponse.json({ error: "Invalid action." }, { status: 400 });

  const job = await prisma.job.findFirst({
    where: { id, companyId: actor.companyId, ...jobScope(actor) },
    select: { id: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const when = resolveOccurredAt(body.occurredAt);
  const gps = sanitizeGps(body);
  const clientKey =
    typeof body.clientKey === "string" && body.clientKey.length > 0 && body.clientKey.length <= 64
      ? `${actor.id}:${body.clientKey}`
      : null;

  // Idempotent replay: this exact tap already landed.
  if (clientKey) {
    const existing = await prisma.timeEntry.findUnique({ where: { clientKey } });
    if (existing && existing.userId === actor.id && existing.companyId === actor.companyId) {
      return NextResponse.json({ success: true, entry: toDTO(existing) });
    }
  }

  const open = await prisma.timeEntry.findFirst({
    where: { userId: actor.id, endedAt: null },
    orderBy: { startedAt: "desc" },
  });

  if (action === "in") {
    if (open && open.jobId === id) {
      // Double-tap / stale UI — already on the clock here.
      return NextResponse.json({ success: true, entry: toDTO(open) });
    }
    const entry = await prisma.$transaction(async (tx) => {
      if (open) {
        // Switched jobs without clocking out — close the old span first.
        const endedAt = when > open.startedAt ? when : open.startedAt;
        await tx.timeEntry.update({ where: { id: open.id }, data: { endedAt } });
        if (open.jobId) {
          await tx.jobNote.create({
            data: {
              jobId: open.jobId,
              userId: actor.id,
              body: `Clocked out — ${formatDuration(endedAt.getTime() - open.startedAt.getTime())} (switched jobs).`,
            },
          });
        }
      }
      const created = await tx.timeEntry.create({
        data: {
          companyId: actor.companyId,
          userId: actor.id,
          jobId: id,
          startedAt: when,
          clientKey,
          startLat: gps?.lat ?? null,
          startLng: gps?.lng ?? null,
          startAccuracy: gps?.accuracy ?? null,
        },
      });
      await tx.jobNote.create({
        data: { jobId: id, userId: actor.id, body: "Clocked in." },
      });
      return created;
    });
    return NextResponse.json({ success: true, entry: toDTO(entry) });
  }

  // action === "out"
  if (!open) {
    return NextResponse.json({ error: "You're not clocked in." }, { status: 409 });
  }
  // Close the open entry wherever it lives — most forgiving for stale UIs.
  const endedAt = when > open.startedAt ? when : open.startedAt;
  const entry = await prisma.$transaction(async (tx) => {
    const updated = await tx.timeEntry.update({
      where: { id: open.id },
      data: {
        endedAt,
        endLat: gps?.lat ?? null,
        endLng: gps?.lng ?? null,
        endAccuracy: gps?.accuracy ?? null,
      },
    });
    if (open.jobId) {
      await tx.jobNote.create({
        data: {
          jobId: open.jobId,
          userId: actor.id,
          body: `Clocked out — ${formatDuration(endedAt.getTime() - open.startedAt.getTime())}.`,
        },
      });
    }
    return updated;
  });
  return NextResponse.json({ success: true, entry: toDTO(entry) });
}

function toDTO(e: {
  id: string;
  jobId: string | null;
  startedAt: Date;
  endedAt: Date | null;
}) {
  return {
    id: e.id,
    jobId: e.jobId,
    startedAt: e.startedAt.toISOString(),
    endedAt: e.endedAt ? e.endedAt.toISOString() : null,
  };
}
