import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { sanitizeBusinessHours, sanitizeServiceZips } from "@/lib/business-hours";
import { sanitizeDuration, sanitizePriceDisplay } from "@/lib/work-items";
import { sanitizeBookingForm, type BookingFormConfig, type FormService } from "@/lib/booking-form";
import { cleanQuestions } from "@/lib/setup-wizard";

/**
 * POST — apply the reviewed setup draft. The client payload is the user's
 * EDITED draft, so it's re-sanitized exactly like any settings form; the one
 * transaction writes company settings, price-book updates/creates, the
 * contract template, client custom fields, and the booking-form config, then
 * stamps setupWizardAt.
 */

function cleanStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function cleanPrice(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 100_000) return null;
  return Math.round(n * 100) / 100;
}

function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  // ── sanitize the whole payload before touching the DB ──
  const industry = cleanStr(body.industry, 80);
  const city = cleanStr(body.city, 80);
  const state = cleanStr(body.state, 40);
  const teamSize = cleanStr(body.teamSize, 40);
  const timezone = isValidTimezone(body.timezone) ? body.timezone : null;
  const businessHours = sanitizeBusinessHours(body.businessHours);
  const serviceZips = sanitizeServiceZips(body.serviceZips);
  const windowRaw = Number(body.arrivalWindowMinutes);
  const arrivalWindowMinutes =
    Number.isInteger(windowRaw) && windowRaw >= 30 && windowRaw <= 480 ? windowRaw : 120;

  const existingUpdates = (Array.isArray(body.existingServices) ? body.existingServices : [])
    .slice(0, 100)
    .map((s) => {
      const r = (s ?? {}) as Record<string, unknown>;
      return {
        workItemId: cleanStr(r.workItemId, 40),
        price: cleanPrice(r.price),
        durationMinutes: sanitizeDuration(r.durationMinutes),
      };
    })
    .filter((s) => s.workItemId);

  const newServices = (Array.isArray(body.newServices) ? body.newServices : [])
    .slice(0, 12)
    .map((s) => {
      const r = (s ?? {}) as Record<string, unknown>;
      return {
        name: cleanStr(r.name, 100),
        description: cleanStr(r.description, 300) || null,
        price: cleanPrice(r.price) ?? 0,
        cost: cleanPrice(r.cost),
        durationMinutes: sanitizeDuration(r.durationMinutes),
        priceDisplay: sanitizePriceDisplay(r.priceDisplay),
      };
    })
    .filter((s) => s.name);

  const contractRaw = (body.contract ?? null) as Record<string, unknown> | null;
  const contract =
    contractRaw && typeof contractRaw === "object"
      ? {
          name: cleanStr(contractRaw.name, 100) || "Service Agreement",
          body: cleanStr(contractRaw.body, 50_000),
        }
      : null;

  const intakeQuestions = cleanQuestions(body.intakeQuestions, 60);
  const clientFields = cleanQuestions(body.clientFields, 80);
  const enableSelfSchedule = body.enableSelfSchedule === true;

  // ── one transaction: all or nothing ──
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: {
        industry: industry || undefined,
        city: city || undefined,
        state: state || undefined,
        teamSize: teamSize || undefined,
        timezone: timezone ?? undefined,
        businessHours: businessHours as object,
        serviceZips,
        arrivalWindowMinutes,
        setupWizardAt: new Date(),
      },
    });

    // price/duration updates on the company's own items only
    for (const u of existingUpdates) {
      await tx.workItem.updateMany({
        where: { id: u.workItemId, companyId },
        data: {
          ...(u.price !== null ? { unitPrice: u.price } : {}),
          durationMinutes: u.durationMinutes,
        },
      });
    }

    const createdServices = [];
    for (const s of newServices) {
      createdServices.push(
        await tx.workItem.create({
          data: {
            companyId,
            name: s.name,
            description: s.description,
            type: "SERVICE",
            unitPrice: s.price,
            unitCost: s.cost,
            durationMinutes: s.durationMinutes,
            priceDisplay: s.priceDisplay,
          },
        })
      );
    }

    if (contract && contract.body.length >= 50) {
      await tx.contractTemplate.create({
        data: { companyId, name: contract.name, body: contract.body },
      });
    }

    if (clientFields.length > 0) {
      const activeCount = await tx.contactFieldDef.count({ where: { companyId, isActive: true } });
      const last = await tx.contactFieldDef.findFirst({
        where: { companyId },
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
      });
      const room = Math.max(0, 20 - activeCount);
      let sortOrder = (last?.sortOrder ?? 0) + 1;
      for (const f of clientFields.slice(0, room)) {
        await tx.contactFieldDef.create({
          data: {
            companyId,
            label: f.label,
            type: f.type === "select" ? "SELECT" : "TEXT",
            options: f.type === "select" ? f.options : [],
            required: false,
            sortOrder: sortOrder++,
          },
        });
      }
    }

    // ── booking form: add bookable services + intake questions, flip self-scheduling ──
    const company = await tx.company.findUnique({
      where: { id: companyId },
      select: { bookingForm: true },
    });
    let form = await tx.webForm.findFirst({
      where: { companyId, type: "BOOKING", isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    if (!form) {
      // mirrors lib/web-forms.ts ensureDefaultForm (not usable here — it runs
      // on the global client, this must stay inside the transaction)
      const count = await tx.webForm.count({ where: { companyId } });
      form = await tx.webForm.create({
        data: {
          companyId,
          name: "Booking Form",
          slug: count === 0 ? "default" : "booking",
          type: "BOOKING",
          isDefault: count === 0,
          config: sanitizeBookingForm(company?.bookingForm) as object,
        },
      });
    }

    const config: BookingFormConfig = sanitizeBookingForm(form.config);

    // services with a duration power the slot picker; dedupe against any
    // services already on the form (by workItemId, then name)
    const bookable: FormService[] = [];
    for (const u of existingUpdates) {
      if (u.durationMinutes === null) continue;
      const item = await tx.workItem.findFirst({
        where: { id: u.workItemId, companyId },
        select: { id: true, name: true, unitPrice: true, priceDisplay: true, description: true },
      });
      if (item) {
        bookable.push({
          id: `setup-${item.id.slice(-8)}`,
          workItemId: item.id,
          name: item.name,
          price: Number(item.unitPrice),
          priceDisplay: item.priceDisplay,
          description: item.description ?? undefined,
        });
      }
    }
    for (const item of createdServices) {
      if (item.durationMinutes === null) continue;
      bookable.push({
        id: `setup-${item.id.slice(-8)}`,
        workItemId: item.id,
        name: item.name,
        price: Number(item.unitPrice),
        priceDisplay: item.priceDisplay,
        description: item.description ?? undefined,
      });
    }
    const have = new Set(
      config.services.flatMap((s) => [s.workItemId ?? "", s.name.toLowerCase()]).filter(Boolean)
    );
    const merged = [
      ...config.services,
      ...bookable.filter((s) => !have.has(s.workItemId!) && !have.has(s.name.toLowerCase())),
    ].slice(0, 30);

    const haveQuestions = new Set(config.customFields.map((f) => f.label.toLowerCase()));
    const newQuestions = intakeQuestions
      .filter((q) => !haveQuestions.has(q.label.toLowerCase()))
      .map((q, i) => ({
        id: `setup-q${i}-${Date.now().toString(36)}`,
        label: q.label,
        type: q.type as "text" | "select",
        required: false,
        options: q.type === "select" ? q.options.map((o) => ({ label: o })) : undefined,
      }));

    const nextConfig: BookingFormConfig = {
      ...config,
      services: merged,
      customFields: [...config.customFields, ...newQuestions].slice(0, 10),
      selfSchedule: { ...config.selfSchedule, enabled: enableSelfSchedule },
    };

    await tx.webForm.update({
      where: { id: form.id },
      data: { config: sanitizeBookingForm(nextConfig) as object },
    });
  });

  return NextResponse.json({ success: true });
}
