import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { GOOGLE_FONT_RE } from "@/lib/booking-page";
import { sanitizeBookingPage } from "@/lib/booking-page";
import { sanitizeBusinessHours, sanitizeServiceZips } from "@/lib/business-hours";
import { sanitizeDeposit } from "@/lib/deposits";
import { SLOT_INTERVAL_CHOICES } from "@/lib/scheduling";
import { getActor, isManager } from "@/lib/permissions";
import { geocodeCompany } from "@/lib/geocoding";
import { isValidTimezone } from "@/lib/timezone";
import { isWallpaper } from "@/lib/wallpapers";
import { sanitizeSectionColors } from "@/lib/section-colors";

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

  // Refuse, don't quietly fix: a blank name would be dropped on the floor
  // while the client showed "Saved", and a surcharge outside 0–10% (or a
  // NaN→null from a blank field) used to land in the column as-is.
  if (body.name !== undefined && !String(body.name ?? "").trim()) {
    return NextResponse.json(
      { error: "Business name can't be empty.", field: "name" },
      { status: 400 }
    );
  }
  if (body.surchargeRate !== undefined) {
    const rate =
      typeof body.surchargeRate === "number" || typeof body.surchargeRate === "string"
        ? Number(body.surchargeRate)
        : NaN;
    if (!Number.isFinite(rate) || rate < 0 || rate > 0.1) {
      return NextResponse.json(
        { error: "Surcharge rate must be between 0% and 10%.", field: "surchargeRate" },
        { status: 400 }
      );
    }
  }

  // Client hub form: null/"" = the plain request form; an id must be one of ours
  const hubFormId =
    body.hubBookingTypeId === undefined
      ? undefined
      : body.hubBookingTypeId === null || body.hubBookingTypeId === ""
        ? null
        : typeof body.hubBookingTypeId === "string" &&
            (await prisma.bookingType.findFirst({ where: { id: body.hubBookingTypeId, companyId }, select: { id: true } }))
          ? body.hubBookingTypeId
          : undefined;

  // Text notifications: the one-time on switch (stamped once, never re-dated)
  // or off. Its own update so the settings form's partial saves never touch it.
  if (body.smsAcknowledged === true) {
    await prisma.company.updateMany({
      where: { id: companyId, smsAcknowledgedAt: null },
      data: { smsAcknowledgedAt: new Date() },
    });
  } else if (body.smsAcknowledged === false) {
    await prisma.company.update({ where: { id: companyId }, data: { smsAcknowledgedAt: null } });
  }

  await prisma.company.update({
    where: { id: companyId },
    data: {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
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
      wallpaper: isWallpaper(body.wallpaper) ? body.wallpaper : undefined,
      sidebarTheme: ["black", "white", "gray"].includes(body.sidebarTheme)
        ? body.sidebarTheme
        : undefined,
      sidebarLogoColor:
        body.sidebarLogoColor !== undefined
          ? /^#[0-9a-fA-F]{6}$/.test(body.sidebarLogoColor ?? "")
            ? body.sidebarLogoColor
            : null
          : undefined,
      // Rail logo plate height in px, clamped so the plate can grow tall but
      // never break the fixed-width rail; null/garbage = back to default (56)
      sidebarLogoSize:
        body.sidebarLogoSize !== undefined
          ? (() => {
              const n = Number(body.sidebarLogoSize);
              return Number.isFinite(n) && n > 0
                ? Math.min(Math.max(Math.round(n), 36), 128)
                : null;
            })()
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
      documentColor:
        body.documentColor !== undefined
          ? /^#[0-9a-fA-F]{6}$/.test(body.documentColor ?? "")
            ? body.documentColor
            : null
          : undefined,
      // App font — any Google Font name, same validation as the booking forms
      brandFont:
        body.brandFont !== undefined
          ? GOOGLE_FONT_RE.test(String(body.brandFont ?? "").trim())
            ? String(body.brandFont).trim()
            : null
          : undefined,
      // Advanced section-color overrides — unknown keys/bad hexes dropped;
      // {} = back to the stock palette.
      sectionColors:
        body.sectionColors !== undefined
          ? (sanitizeSectionColors(body.sectionColors) as object)
          : undefined,
      surchargeEnabled: body.surchargeEnabled ?? undefined,
      surchargeRate: body.surchargeRate !== undefined ? Number(body.surchargeRate) : undefined,
      // Default sales-tax rate as a fraction (0.0825 = 8.25%); null clears it
      defaultTaxRate:
        body.defaultTaxRate !== undefined
          ? (() => {
              const rate = Number(body.defaultTaxRate);
              return Number.isFinite(rate) && rate > 0
                ? Math.min(rate, 0.9999)
                : null;
            })()
          : undefined,
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
      // Booking drive-time limit (minutes; 0 clears it → off)
      bookingDriveLimitMinutes:
        body.bookingDriveLimitMinutes !== undefined &&
        Number.isInteger(Number(body.bookingDriveLimitMinutes)) &&
        Number(body.bookingDriveLimitMinutes) >= 0 &&
        Number(body.bookingDriveLimitMinutes) <= 240
          ? Number(body.bookingDriveLimitMinutes) || null
          : undefined,
      // Even time-slot granularity for in-app job/appointment scheduling; only
      // an allowed choice is accepted, anything else leaves the value unchanged.
      schedulingIntervalMinutes:
        body.schedulingIntervalMinutes !== undefined &&
        (SLOT_INTERVAL_CHOICES as readonly number[]).includes(Number(body.schedulingIntervalMinutes))
          ? Number(body.schedulingIntervalMinutes)
          : undefined,
      bookingPage: body.bookingPage !== undefined ? sanitizeBookingPage(body.bookingPage) : undefined,
      hubBookingTypeId: hubFormId,
    },
  });

  // Shop address changed → refresh the geocoded route start point
  // (fire-and-forget; the Route Manager falls back to the first stop).
  if (
    body.address !== undefined ||
    body.city !== undefined ||
    body.state !== undefined ||
    body.zip !== undefined
  ) {
    void geocodeCompany(companyId);
  }

  return NextResponse.json({ success: true });
}
