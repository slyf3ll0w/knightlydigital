import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sanitizeBookingForm } from "@/lib/booking-form";
import { sanitizeDeposit } from "@/lib/deposits";
import { getActor, isManager } from "@/lib/permissions";

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function PATCH(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();

  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: body.name || undefined,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      zip: body.zip || null,
      website: body.website || null,
      industry: body.industry !== undefined ? body.industry || null : undefined,
      logoUrl: body.logoUrl !== undefined ? body.logoUrl || null : undefined,
      brandColor:
        body.brandColor !== undefined
          ? /^#[0-9a-fA-F]{6}$/.test(body.brandColor ?? "")
            ? body.brandColor
            : null
          : undefined,
      surchargeEnabled: body.surchargeEnabled ?? undefined,
      surchargeRate: body.surchargeRate ?? undefined,
      ...(body.defaultDepositType !== undefined &&
        (() => {
          const d = sanitizeDeposit({
            depositType: body.defaultDepositType,
            depositValue: body.defaultDepositValue,
          });
          return { defaultDepositType: d.depositType, defaultDepositValue: d.depositValue };
        })()),
      reviewLink: body.reviewLink || null,
      timezone: isValidTimezone(body.timezone) ? body.timezone : undefined,
      bookingForm: body.bookingForm !== undefined ? sanitizeBookingForm(body.bookingForm) : undefined,
    },
  });

  return NextResponse.json({ success: true });
}
