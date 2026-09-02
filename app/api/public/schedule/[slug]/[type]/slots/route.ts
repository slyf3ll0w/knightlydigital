import { NextRequest, NextResponse } from "next/server";
import { limit, clientIp } from "@/lib/rate-limit";
import { zipFromAddress } from "@/lib/business-hours";
import { groupSlotsByDay } from "@/lib/booking-engine";
import { resolvePublicBookingType, slotsForType, toPublicBookingType } from "@/lib/booking-runtime";
import { KIND_META } from "@/lib/booking-types";
import { serviceSelection } from "@/lib/booking-services";

/**
 * Public slot lookup for a booking type.
 *   GET /api/public/schedule/[companySlug]/[typeSlug]/slots?address=&services=a,b
 * Returns { outOfArea } when the ZIP misses the service area, or
 * { days: [{ date, label, slots: [{ start, end, windowEnd, label }] }],
 *   exactTime, timezone, driveAware }. Labels are in company time; the
 * client re-labels call times in the visitor's zone.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; type: string }> }) {
  const { slug, type: typeSlug } = await params;
  const ip = clientIp(req.headers);
  if (!limit(`booking-slots:${ip}`, 60, 60000).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const resolved = await resolvePublicBookingType(slug, typeSlug);
  if (!resolved) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { company, type } = resolved;
  const pub = toPublicBookingType(type, company);
  if (!pub.bookable) return NextResponse.json({ days: [], exactTime: pub.exactTime, timezone: company.timezone, unavailable: true });

  const q = req.nextUrl.searchParams;
  const meta = KIND_META[type.kind];
  const address = (q.get("address") ?? "").slice(0, 300).trim();
  const zip = zipFromAddress(address);
  const zipRequired = meta.needsAddress && company.serviceZips.length > 0;
  if (zipRequired && zip && !company.serviceZips.includes(zip)) {
    return NextResponse.json({ zipRequired, outOfArea: true, days: [], exactTime: pub.exactTime, timezone: company.timezone });
  }
  // In-person kinds need a complete address (with ZIP) before we spend a
  // geocode on it — the page asks for it before showing times.
  if (meta.needsAddress && !zip) {
    return NextResponse.json({ zipRequired, addressRequired: true, days: [], exactTime: pub.exactTime, timezone: company.timezone });
  }

  // SERVICE kinds: duration = the picked services' time on site
  let durationMinutes: number | undefined;
  if (type.kind === "SERVICE") {
    const sel = serviceSelection(type, q.get("services"));
    if (!sel) return NextResponse.json({ error: "Pick a service to book." }, { status: 400 });
    durationMinutes = sel.durationMinutes;
  }

  const { slots, driveAware } = await slotsForType(type, company, {
    address: meta.needsAddress ? address : null,
    durationMinutes,
  });
  return NextResponse.json({
    zipRequired,
    outOfArea: false,
    exactTime: pub.exactTime,
    timezone: company.timezone,
    driveAware,
    days: groupSlotsByDay(company.timezone, slots),
  });
}
