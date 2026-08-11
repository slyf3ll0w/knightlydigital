import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import {
  billSubscriptionNow,
  generateDueVisits,
  deleteFutureVisits,
  addVisitInterval,
  firstOfNextMonth,
} from "@/lib/subscriptions";

/**
 * PATCH — manage one subscription. Body:
 *   { status: "ACTIVE" | "PAUSED" | "CANCELLED" }  — pause/resume/cancel
 *   { action: "billNow" }                          — bill this cycle immediately
 *   { name?, unitPrice?, quantity?, interval?, nextRunDate?, billPerVisit? }
 *     — reprice/edit; takes effect from the next billing run (already-
 *     generated invoices keep their amounts). billPerVisit: true switches the
 *     series to per-completed-visit invoicing (clears interval/nextRunDate —
 *     the two billing styles are mutually exclusive).
 *   { visitFrequency?, nextVisitDate?, visitStartMinutes?,
 *     visitDurationMinutes?, visitAssigneeIds? } — the visit series (weekly
 *     mows billed monthly). Setting a frequency materializes upcoming visits
 *     immediately; clearing it (null) deletes untouched future visit jobs.
 * Pause/cancel also clears untouched future visits; resume re-materializes
 * from the next on-cadence date. Managers only.
 */

const validIntervals = ["MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];
const validFrequencies = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const { id } = await params;
  const sub = await prisma.subscription.findFirst({ where: { id, companyId } });
  if (!sub) return NextResponse.json({ error: "Subscription not found." }, { status: 404 });

  const body = await req.json();

  if (body.action === "billNow") {
    const outcome = await billSubscriptionNow(id, companyId);
    if (!outcome) return NextResponse.json({ error: "This series has nothing to bill." }, { status: 400 });
    if (outcome === "empty") {
      return NextResponse.json(
        { error: "No completed visits to bill yet — finish a visit first." },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, outcome });
  }

  const data: Record<string, unknown> = {};

  if (body.status && ["ACTIVE", "PAUSED", "CANCELLED"].includes(body.status)) {
    data.status = body.status;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 150);
    if (!name) return NextResponse.json({ error: "The subscription needs a name." }, { status: 400 });
    data.name = name;
  }
  if (body.unitPrice !== undefined) {
    const price = Number(body.unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ error: "Price must be zero or more." }, { status: 400 });
    }
    data.unitPrice = Math.round(price * 100) / 100;
  }
  if (body.quantity !== undefined) {
    const qty = Number(body.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return NextResponse.json({ error: "Quantity must be greater than zero." }, { status: 400 });
    }
    data.quantity = qty;
  }
  if (body.billPerVisit !== undefined) {
    if (body.billPerVisit === true) {
      if (body.interval) {
        return NextResponse.json(
          { error: "Pick scheduled billing or per-visit billing, not both." },
          { status: 400 }
        );
      }
      data.billPerVisit = true;
      data.interval = null;
      // Consolidated series keep nextRunDate as their monthly cursor
      data.nextRunDate = body.consolidateMonthly === true ? firstOfNextMonth() : null;
    } else {
      data.billPerVisit = false;
    }
  }
  if (body.consolidateMonthly !== undefined) {
    const finalBillPerVisit =
      data.billPerVisit !== undefined ? data.billPerVisit : sub.billPerVisit;
    if (body.consolidateMonthly === true) {
      if (!finalBillPerVisit) {
        return NextResponse.json(
          { error: "Monthly consolidation only applies to per-visit billing." },
          { status: 400 }
        );
      }
      data.consolidateMonthly = true;
      if (data.nextRunDate === undefined && !sub.nextRunDate) {
        data.nextRunDate = firstOfNextMonth();
      }
    } else {
      data.consolidateMonthly = false;
      // Back to bill-on-completion: the monthly cursor has no meaning
      if (finalBillPerVisit) data.nextRunDate = null;
    }
  }
  if (body.interval !== undefined && data.interval === undefined) {
    if (!validIntervals.includes(body.interval)) {
      return NextResponse.json({ error: "Invalid billing interval." }, { status: 400 });
    }
    data.interval = body.interval;
    // Scheduled billing replaces per-visit billing
    if (sub.billPerVisit) data.billPerVisit = false;
  }
  if (body.nextRunDate !== undefined) {
    if (!body.nextRunDate) {
      return NextResponse.json({ error: "A next billing date is required." }, { status: 400 });
    }
    // date-only, noon-anchored like the billing engine expects
    const next = new Date(
      String(body.nextRunDate).length === 10 ? `${body.nextRunDate}T12:00:00` : body.nextRunDate
    );
    if (isNaN(next.getTime())) {
      return NextResponse.json({ error: "Invalid next billing date." }, { status: 400 });
    }
    data.nextRunDate = next;
  }

  // ── Visit series ────────────────────────────────────────────────────────────
  if (body.visitFrequency !== undefined) {
    if (body.visitFrequency === null || body.visitFrequency === "") {
      data.visitFrequency = null;
      data.nextVisitDate = null;
    } else if (!validFrequencies.includes(body.visitFrequency)) {
      return NextResponse.json({ error: "Invalid visit frequency." }, { status: 400 });
    } else {
      data.visitFrequency = body.visitFrequency;
    }
  }
  if (body.nextVisitDate !== undefined && data.visitFrequency !== null) {
    if (body.nextVisitDate) {
      const next = new Date(
        String(body.nextVisitDate).length === 10 ? `${body.nextVisitDate}T12:00:00` : body.nextVisitDate
      );
      if (isNaN(next.getTime())) {
        return NextResponse.json({ error: "Invalid next visit date." }, { status: 400 });
      }
      data.nextVisitDate = next;
    } else {
      data.nextVisitDate = null;
    }
  }
  if (body.visitStartMinutes !== undefined) {
    if (body.visitStartMinutes === null || body.visitStartMinutes === "") {
      data.visitStartMinutes = null; // "Anytime"
    } else {
      const mins = Number(body.visitStartMinutes);
      if (!Number.isInteger(mins) || mins < 0 || mins > 1435) {
        return NextResponse.json({ error: "Invalid visit start time." }, { status: 400 });
      }
      data.visitStartMinutes = mins;
    }
  }
  if (body.visitDurationMinutes !== undefined) {
    if (body.visitDurationMinutes === null || body.visitDurationMinutes === "") {
      data.visitDurationMinutes = null;
    } else {
      const mins = Number(body.visitDurationMinutes);
      if (!Number.isInteger(mins) || mins < 15 || mins > 12 * 60) {
        return NextResponse.json({ error: "Visit length must be between 15 minutes and 12 hours." }, { status: 400 });
      }
      data.visitDurationMinutes = mins;
    }
  }
  if (body.visitAssigneeIds !== undefined) {
    if (!Array.isArray(body.visitAssigneeIds) || body.visitAssigneeIds.some((v: unknown) => typeof v !== "string")) {
      return NextResponse.json({ error: "Invalid assignee list." }, { status: 400 });
    }
    const valid = await prisma.user.findMany({
      where: { id: { in: body.visitAssigneeIds }, companyId, isActive: true },
      select: { id: true },
    });
    data.visitAssigneeIds = valid.map((u) => u.id);
  }

  // Pin autopay to one of the client's saved cards (null = the default card)
  if (body.savedCardId !== undefined) {
    if (body.savedCardId === null || body.savedCardId === "") {
      data.savedCardId = null;
    } else {
      const card = await prisma.savedCard.findFirst({
        where: { id: String(body.savedCardId), contactId: sub.contactId },
        select: { id: true },
      });
      if (!card) {
        return NextResponse.json({ error: "That card isn't on this client's file." }, { status: 400 });
      }
      data.savedCardId = card.id;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // A series needs a first visit date: take the new one, keep the existing one,
  // or refuse.
  const finalFrequency =
    data.visitFrequency !== undefined ? data.visitFrequency : sub.visitFrequency;
  let finalNextVisit =
    data.nextVisitDate !== undefined ? (data.nextVisitDate as Date | null) : sub.nextVisitDate;
  if (finalFrequency && !finalNextVisit) {
    return NextResponse.json({ error: "Pick the first visit date." }, { status: 400 });
  }

  // Per-visit billing without visits would never bill anything
  const finalPerVisit =
    data.billPerVisit !== undefined ? (data.billPerVisit as boolean) : sub.billPerVisit;
  if (finalPerVisit && !finalFrequency) {
    return NextResponse.json(
      { error: "Per-visit billing needs a repeating visit schedule." },
      { status: 400 }
    );
  }

  // Resuming (or editing) with a stale date: roll forward on-cadence so the
  // series keeps its weekday instead of dumping missed visits into the past.
  if (finalFrequency && finalNextVisit) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    let rolled = finalNextVisit;
    while (rolled < todayStart) {
      rolled = addVisitInterval(rolled, finalFrequency as never);
    }
    if (rolled !== finalNextVisit) {
      data.nextVisitDate = rolled;
      finalNextVisit = rolled;
    }
  }

  const updated = await prisma.subscription.update({ where: { id }, data });

  // Side effects on the materialized visits
  const stopped =
    data.visitFrequency === null ||
    data.status === "PAUSED" ||
    data.status === "CANCELLED";
  let visitsDeleted = 0;
  let visits = null;
  if (stopped) {
    visitsDeleted = await deleteFutureVisits(id, companyId);
  } else if (updated.status === "ACTIVE" && updated.visitFrequency && updated.nextVisitDate) {
    // Materialize right away so the calendar reflects the save immediately
    visits = await generateDueVisits(new Date(), companyId);
  }

  return NextResponse.json({ ...updated, visitsDeleted, visitsCreated: visits?.visitsCreated ?? 0 });
}
