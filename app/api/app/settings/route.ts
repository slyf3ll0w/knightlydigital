import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sanitizeBookingForm } from "@/lib/booking-form";
import { sanitizeBusinessHours, sanitizeServiceZips } from "@/lib/business-hours";
import { sanitizeDeposit } from "@/lib/deposits";
import { SLOT_INTERVAL_CHOICES } from "@/lib/scheduling";
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

  // Partial-safe: only fields present in the body change (the settings form
  // sends everything; the AI assistant sends just what the user asked for).
  const opt = (v: unknown): string | null | undefined =>
    v === undefined ? undefined : v ? String(v) : null;

  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: body.name || undefined,
      phone: opt(body.phone),
      email: opt(body.email),
      address: opt(body.address),
      city: opt(body.city),
      state: opt(body.state),
      zip: opt(body.zip),
      website: opt(body.website),
      assistantName:
        body.assistantName !== undefined
          ? String(body.assistantName).trim().slice(0, 40) || null
          : undefined,
      industry: body.industry !== undefined ? body.industry || null : undefined,
      logoUrl: body.logoUrl !== undefined ? body.logoUrl || null : undefined,
      logoWallpaper: typeof body.logoWallpaper === "boolean" ? body.logoWallpaper : undefined,
      sidebarTheme: ["black", "white", "gray"].includes(body.sidebarTheme)
        ? body.sidebarTheme
        : undefined,
      sidebarLogoColor:
        body.sidebarLogoColor !== undefined
          ? /^#[0-9a-fA-F]{6}$/.test(body.sidebarLogoColor ?? "")
            ? body.sidebarLogoColor
            : null
          : undefined,
      brandColor:
        body.brandColor !== undefined
          ? /^#[0-9a-fA-F]{6}$/.test(body.brandColor ?? "")
            ? body.brandColor
            : null
          : undefined,
      brandColorSecondary:
        body.brandColorSecondary !== undefined
          ? /^#[0-9a-fA-F]{6}$/.test(body.brandColorSecondary ?? "")
            ? body.brandColorSecondary
            : null
          : undefined,
      surchargeEnabled: body.surchargeEnabled ?? undefined,
      surchargeRate: body.surchargeRate ?? undefined,
      hideConvertedLeads:
        typeof body.hideConvertedLeads === "boolean" ? body.hideConvertedLeads : undefined,
      ...(body.defaultDepositType !== undefined &&
        (() => {
          const d = sanitizeDeposit({
            depositType: body.defaultDepositType,
            depositValue: body.defaultDepositValue,
          });
          return { defaultDepositType: d.depositType, defaultDepositValue: d.depositValue };
        })()),
      reviewLink: opt(body.reviewLink),
      // "On my way" text template — blank falls back to the built-in default
      onMyWayTemplate:
        body.onMyWayTemplate !== undefined
          ? String(body.onMyWayTemplate).trim().slice(0, 320) || null
          : undefined,
      timezone: isValidTimezone(body.timezone) ? body.timezone : undefined,
      // Online-booking scheduling settings
      businessHours:
        body.businessHours !== undefined
          ? (sanitizeBusinessHours(body.businessHours) as object)
          : undefined,
      serviceZips: body.serviceZips !== undefined ? sanitizeServiceZips(body.serviceZips) : undefined,
      arrivalWindowMinutes:
        body.arrivalWindowMinutes !== undefined &&
        Number.isInteger(Number(body.arrivalWindowMinutes)) &&
        Number(body.arrivalWindowMinutes) >= 30 &&
        Number(body.arrivalWindowMinutes) <= 480
          ? Number(body.arrivalWindowMinutes)
          : undefined,
      // Even time-slot granularity for in-app job/appointment scheduling; only
      // an allowed choice is accepted, anything else leaves the value unchanged.
      schedulingIntervalMinutes:
        body.schedulingIntervalMinutes !== undefined &&
        (SLOT_INTERVAL_CHOICES as readonly number[]).includes(Number(body.schedulingIntervalMinutes))
          ? Number(body.schedulingIntervalMinutes)
          : undefined,
      bookingForm: body.bookingForm !== undefined ? sanitizeBookingForm(body.bookingForm) : undefined,
    },
  });

  return NextResponse.json({ success: true });
}
