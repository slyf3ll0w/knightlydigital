import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSeeMoney, isManager, contactScope } from "@/lib/permissions";
import {
  firstRunDate,
  firstOfNextMonth,
  generateDueVisits,
  billSubscriptionNow,
} from "@/lib/subscriptions";
import { inPreview } from "@/lib/preview";

/** GET — recurring subscriptions for the company (money-visible roles). */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canSeeMoney(actor)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const subs = await prisma.subscription.findMany({
    where: { companyId: actor.companyId },
    include: { contact: { select: { firstName: true, lastName: true } } },
    orderBy: [{ status: "asc" }, { nextRunDate: "asc" }],
  });
  return NextResponse.json(subs);
}

const validIntervals = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];
const validFrequencies = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"];

/** Noon-anchored today — makes a new plan's first cycle due immediately. */
function noonToday(): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d;
}

/**
 * POST — create a recurring series directly (until now they only came from
 * selling a recurring price-book service through a quote or invoice).
 *
 * Three shapes, same model:
 * - Standalone recurring JOB ("mow every 2 weeks"): visitFrequency +
 *   nextVisitDate required, no billing — interval/nextRunDate stay null and
 *   the billing sweep never sees it.
 * - Billed subscription: interval + unitPrice, first invoice one interval out.
 * - Per-visit billed series: billPerVisit + unitPrice + a visit schedule —
 *   each completed visit mints its own invoice (see billCompletedVisit).
 *   With consolidateMonthly, completed visits instead accumulate and bill as
 *   ONE invoice on the 1st (nextRunDate is the monthly cursor).
 * Visit series fields mirror the PATCH route; visits materialize immediately.
 */
export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json().catch(() => ({}));

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 150) : "";
  if (!name) return NextResponse.json({ error: "The series needs a name." }, { status: 400 });

  const contact = await prisma.contact.findFirst({
    where: { id: body.contactId ?? "", companyId, ...contactScope(actor) },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Client not found." }, { status: 404 });

  // Billing is optional — but when present it must be complete. A series
  // bills on a schedule (interval), per completed visit (billPerVisit), or
  // not at all — never both.
  const bills = Boolean(body.interval);
  const perVisit = body.billPerVisit === true;
  const consolidate = perVisit && body.consolidateMonthly === true;
  // Per-job queue mode: completed visits accumulate in the Ready-to-bill
  // queue instead of invoicing on completion; only the owner's "Bill ready
  // work" (or per-series Bill now) bills them. Modeled as consolidateMonthly
  // WITHOUT a monthly cursor, so the cron sweep never picks it up.
  const holdForReview = perVisit && body.holdForReview === true;
  if (bills && perVisit) {
    return NextResponse.json(
      { error: "Pick scheduled billing or per-visit billing, not both." },
      { status: 400 }
    );
  }
  if (bills && !validIntervals.includes(body.interval)) {
    return NextResponse.json({ error: "Invalid billing interval." }, { status: 400 });
  }
  const unitPrice = Number(body.unitPrice) || 0;
  if (unitPrice < 0) {
    return NextResponse.json({ error: "Price must be zero or more." }, { status: 400 });
  }
  if ((bills || perVisit) && unitPrice === 0) {
    return NextResponse.json(
      { error: "A billed subscription needs a price (or turn billing off)." },
      { status: 400 }
    );
  }

  // The visit series — required for a non-scheduled-billing series (per-visit
  // billing has nothing to bill without visits; a no-billing series would
  // never do anything at all)
  const frequency = body.visitFrequency ?? null;
  if (frequency && !validFrequencies.includes(frequency)) {
    return NextResponse.json({ error: "Invalid visit frequency." }, { status: 400 });
  }
  if (perVisit && !frequency) {
    return NextResponse.json(
      { error: "Per-visit billing needs a repeating visit schedule." },
      { status: 400 }
    );
  }
  if (!bills && !frequency) {
    return NextResponse.json(
      { error: "Pick how often the visits repeat (or add billing)." },
      { status: 400 }
    );
  }
  let nextVisitDate: Date | null = null;
  if (frequency) {
    if (!body.nextVisitDate) {
      return NextResponse.json({ error: "Pick the first visit date." }, { status: 400 });
    }
    nextVisitDate = new Date(
      String(body.nextVisitDate).length === 10 ? `${body.nextVisitDate}T12:00:00` : body.nextVisitDate
    );
    if (isNaN(nextVisitDate.getTime())) {
      return NextResponse.json({ error: "Invalid first visit date." }, { status: 400 });
    }
  }
  let visitStartMinutes: number | null = null;
  if (body.visitStartMinutes !== undefined && body.visitStartMinutes !== null && body.visitStartMinutes !== "") {
    const mins = Number(body.visitStartMinutes);
    if (!Number.isInteger(mins) || mins < 0 || mins > 1435) {
      return NextResponse.json({ error: "Invalid visit start time." }, { status: 400 });
    }
    visitStartMinutes = mins;
  }
  let visitDurationMinutes: number | null = null;
  if (body.visitDurationMinutes !== undefined && body.visitDurationMinutes !== null && body.visitDurationMinutes !== "") {
    const mins = Number(body.visitDurationMinutes);
    if (!Number.isInteger(mins) || mins < 15 || mins > 12 * 60) {
      return NextResponse.json(
        { error: "Visit length must be between 15 minutes and 12 hours." },
        { status: 400 }
      );
    }
    visitDurationMinutes = mins;
  }
  const visitAssigneeIds = Array.isArray(body.visitAssigneeIds)
    ? (
        await prisma.user.findMany({
          where: {
            id: { in: body.visitAssigneeIds.filter((v: unknown) => typeof v === "string") },
            companyId,
            isActive: true,
          },
          select: { id: true },
        })
      ).map((u) => u.id)
    : [];

  // Saved service address — generated visits land at that property
  const property =
    typeof body.propertyId === "string" && body.propertyId
      ? await prisma.contactAddress.findFirst({
          where: { id: body.propertyId, contactId: contact.id },
          select: { id: true },
        })
      : null;

  const preview = await inPreview(companyId);
  const sub = await prisma.subscription.create({
    data: {
      companyId,
      contactId: contact.id,
      name,
      description: typeof body.description === "string" && body.description.trim()
        ? body.description.trim().slice(0, 2000)
        : null,
      unitPrice: Math.round(unitPrice * 100) / 100,
      quantity: 1,
      interval: bills ? body.interval : null,
      // Plans bill their first cycle immediately (noon today) — the day the
      // first payment SUCCEEDS then becomes the recurring anchor (see
      // anchorPlanFromFirstPayment). Preview-mode companies can't invoice,
      // so they keep the old one-interval-out start. Legacy consolidated
      // series bill on the 1st — nextRunDate is their cursor; queue-mode
      // series have no cursor at all.
      nextRunDate: bills
        ? preview
          ? firstRunDate(body.interval)
          : noonToday()
        : consolidate
          ? firstOfNextMonth()
          : null,
      billPerVisit: perVisit,
      consolidateMonthly: consolidate || holdForReview,
      invoiceMode: body.invoiceMode === "DRAFT" ? "DRAFT" : "SEND",
      propertyId: property?.id ?? null,
      visitFrequency: frequency,
      nextVisitDate,
      visitStartMinutes,
      visitDurationMinutes,
      visitAssigneeIds,
    },
  });

  // Put the first visits on the calendar right away
  const visits = frequency ? await generateDueVisits(new Date(), companyId) : null;

  // Plans: mint (and auto-charge) the first invoice right now — signing a
  // client up should feel like something happened. The day this payment
  // SUCCEEDS becomes the recurring anchor.
  let firstBill: "billed" | "drafted" | "charged" | "empty" | null = null;
  if (bills && !preview) {
    firstBill = await billSubscriptionNow(sub.id, companyId).catch((e) => {
      console.error("[subscriptions] first cycle failed for", sub.id, e);
      return null;
    });
  }

  return NextResponse.json(
    {
      ...JSON.parse(JSON.stringify(sub)),
      visitsCreated: visits?.visitsCreated ?? 0,
      firstBill,
    },
    { status: 201 }
  );
}
