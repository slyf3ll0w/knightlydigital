import { NextRequest, NextResponse } from "next/server";
import { getActor, isManager } from "@/lib/permissions";
import { reportError } from "@/lib/report-error";
import { isBillingProduct, planGatingLive, type BillingCadence } from "@/lib/plans";
import {
  addSeat,
  billingErrorResponse,
  cancelPlan,
  planBillingState,
  putCardOnFile,
  removeSeat,
  resumePlan,
  subscribe,
} from "@/lib/plan-billing";

/**
 * Settings → Plans (lib/plan-billing.ts).
 *
 * GET  — the page's read model: every plan card, seats, the card on file.
 *        Managers may look; only the OWNER may act.
 * POST — one action at a time:
 *   { action: "subscribe", product, cadence, sourceId? }   add a plan / Max / switch term (sourceId = a fresh Web Payments token)
 *   { action: "cancel", id }                               end at the period's close
 *   { action: "resume", id }                               call a scheduled cancel off
 *   { action: "card", sourceId }                           replace the card on file
 *   { action: "seat-add", sourceId? } / { action: "seat-remove" }
 * Every success answers the fresh state. Square trouble is 424 (Cloudflare
 * swallows 502/504 bodies); a declined card is 402 { code: "CARD_DECLINED" }.
 */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const state = await planBillingState(actor.companyId, planGatingLive());
  return NextResponse.json(state);
}

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.role !== "OWNER") {
    return NextResponse.json({ error: "Only the owner can change the company's plan." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const action = str("action");
  const companyId = actor.companyId;

  try {
    switch (action) {
      case "subscribe": {
        const product = str("product");
        const cadence = str("cadence") || "MONTHLY";
        if (!isBillingProduct(product)) return NextResponse.json({ error: "Pick a plan." }, { status: 400 });
        if (cadence !== "MONTHLY" && cadence !== "ANNUAL") return NextResponse.json({ error: "Monthly or annual." }, { status: 400 });
        await subscribe({ companyId, product, cadence: cadence as BillingCadence, sourceId: str("sourceId") || null });
        break;
      }
      case "cancel":
        if (!str("id")) return NextResponse.json({ error: "Which plan?" }, { status: 400 });
        await cancelPlan({ companyId, rowId: str("id") });
        break;
      case "resume":
        if (!str("id")) return NextResponse.json({ error: "Which plan?" }, { status: 400 });
        await resumePlan({ companyId, rowId: str("id") });
        break;
      case "card":
        if (!str("sourceId")) return NextResponse.json({ error: "Enter a card." }, { status: 400 });
        await putCardOnFile(companyId, str("sourceId"));
        break;
      case "seat-add":
        await addSeat({ companyId, sourceId: str("sourceId") || null });
        break;
      case "seat-remove":
        await removeSeat({ companyId });
        break;
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (err) {
    const out = billingErrorResponse(err);
    if (out.status >= 500) reportError(`[billing] ${action} failed`, err);
    else console.warn(`[billing] ${action} refused for ${companyId}: ${out.error}`);
    return NextResponse.json({ error: out.error, ...(out.code ? { code: out.code } : {}) }, { status: out.status });
  }

  console.warn(`[billing] ${action} by user ${actor.id} for ${companyId}`);
  const state = await planBillingState(companyId, planGatingLive());
  return NextResponse.json(state);
}
