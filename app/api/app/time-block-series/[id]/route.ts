import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor } from "@/lib/permissions";
import { parseSeriesInput } from "@/lib/time-block-recurrence";
import {
  cleanTitle,
  companyTimezone,
  findEditableSeries,
  regenerateSeries,
  resolveBlockAddress,
  resolveBlockTarget,
  toSeriesDTO,
} from "@/lib/time-block-series";

/**
 * PATCH — change a repeating block's rule, title, who or where. Any field
 * may be omitted (the stored value stands in). Every change rebuilds the
 * occurrences still ahead; days already over, and days removed or edited on
 * their own, are left alone.
 * DELETE — remove the series and every occurrence of it, past and future.
 * Managers may touch any series in the company; everyone else only their own.
 */

const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const series = await findEditableSeries(actor, id);
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const parsed = parseSeriesInput({
    weekdays: body.weekdays ?? series.weekdays,
    allDay: body.allDay ?? series.allDay,
    startTime: body.startTime ?? hhmm(series.startMinute),
    endTime: body.endTime ?? hhmm(series.endMinute),
    startsOn: body.startsOn ?? series.startsOn,
    endsOn: body.endsOn === undefined ? series.endsOn : body.endsOn,
  });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const who = await resolveBlockTarget(actor, body, series.userId);
  if (!who.ok) return NextResponse.json({ error: who.error }, { status: who.status });

  const data: Record<string, unknown> = { ...parsed.rule, userId: who.userId };
  if (body.title !== undefined) data.title = cleanTitle(body.title);
  if (body.address !== undefined) {
    const where = await resolveBlockAddress(body, actor.companyId);
    if (where.address === series.address) {
      data.address = series.address;
    } else {
      Object.assign(data, where);
    }
  }

  const updated = await prisma.timeBlockSeries.update({ where: { id: series.id }, data });
  const created = await regenerateSeries(updated, await companyTimezone(actor.companyId), new Date());
  return NextResponse.json({ ...toSeriesDTO(updated, actor), created });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const series = await findEditableSeries(actor, id);
  if (!series) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Occurrences cascade with the series
  await prisma.timeBlockSeries.delete({ where: { id: series.id } });
  return NextResponse.json({ ok: true });
}
