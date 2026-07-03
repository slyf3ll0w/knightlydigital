import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveWebForm } from "@/lib/web-forms";
import { limit, clientIp } from "@/lib/rate-limit";
import { generateSlots } from "@/lib/booking-slots";
import {
  engineInputFor,
  getBookableUsersWithBusy,
  groupSlotsByDay,
  resolveBookableService,
} from "@/lib/booking-availability";

/**
 * Public slot lookup for self-scheduling booking forms.
 *   GET /api/public/booking-slots/[companySlug]?form=<formSlug>&service=<formServiceId>&zip=<zip>
 * Returns { zipRequired, outOfArea } or { days: [{ date, label, slots }] }.
 * Times are labeled in the company's timezone (the visit happens there).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const ip = clientIp(req.headers);
  if (!limit(`booking-slots:${ip}`, 60, 60000).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const q = req.nextUrl.searchParams;
  const resolved = await resolveWebForm(slug, q.get("form")?.slice(0, 60) || undefined);
  if (!resolved) return NextResponse.json({ error: "Form not found." }, { status: 404 });
  const { company, form } = resolved;
  const config = form.config;

  if (form.type !== "BOOKING" || !config.selfSchedule.enabled) {
    return NextResponse.json({ error: "Scheduling is not enabled for this form." }, { status: 404 });
  }

  const zipRequired = company.serviceZips.length > 0;
  const zip = (q.get("zip") ?? "").trim();
  if (zipRequired && zip && !company.serviceZips.includes(zip)) {
    return NextResponse.json({ zipRequired, outOfArea: true, days: [] });
  }

  const service = await resolveBookableService(company.id, config, q.get("service"));
  if (!service) {
    return NextResponse.json({ error: "That service can't be booked online." }, { status: 400 });
  }

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + (config.selfSchedule.horizonDays + 1) * 86400000);
  const users = await getBookableUsersWithBusy(company.id, now, horizonEnd);
  const slots = generateSlots(engineInputFor(company, config, service.durationMinutes, users, now));

  return NextResponse.json({
    zipRequired,
    outOfArea: false,
    days: groupSlotsByDay(company.timezone, slots),
  });
}
