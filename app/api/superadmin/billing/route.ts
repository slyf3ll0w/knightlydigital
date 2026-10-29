import { NextRequest, NextResponse } from "next/server";
import { getSuperadmin } from "@/lib/superadmin";
import { logConsoleAction } from "@/lib/console-audit";
import { SquareError, isTransientSquareError } from "@/lib/square";
import { addCatalogPrice, catalogVariations } from "@/lib/plan-catalog";
import { planBillingConfigured } from "@/lib/plan-billing-env";
import { isBillingProduct, type BillingCadence } from "@/lib/plans";

/**
 * Console → Billing (lib/plan-catalog.ts): the plans as they exist in
 * WorkBench's own Square account.
 *   { action: "add-price", product, cadence, name, cents }  a new variation under that product's plan
 *   { action: "reread" }                                     drop the 10-minute catalog cache
 * Every action lands in the console audit trail.
 */
export async function POST(req: NextRequest) {
  const admin = await getSuperadmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";

  if (!(await planBillingConfigured())) {
    return NextResponse.json(
      { error: "Plan billing isn't set up: mark WorkBench's own company and connect its Square account first." },
      { status: 503 }
    );
  }

  try {
    if (action === "reread") {
      const variations = await catalogVariations(true);
      return NextResponse.json({ success: true, count: variations.length });
    }
    if (action === "add-price") {
      const product = typeof body.product === "string" ? body.product : "";
      const cadence: BillingCadence = body.cadence === "ANNUAL" ? "ANNUAL" : "MONTHLY";
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
      const cents = typeof body.cents === "number" && Number.isFinite(body.cents) ? Math.round(body.cents) : NaN;
      if (!isBillingProduct(product) || product === "JOBSITE") return NextResponse.json({ error: "Pick a plan." }, { status: 400 });
      if (!name) return NextResponse.json({ error: "Give the price a name (what the owner sees on their Plans page)." }, { status: 400 });
      if (!(cents >= 0 && cents <= 1_000_000)) return NextResponse.json({ error: "Enter an amount between $0 and $10,000." }, { status: 400 });
      const made = await addCatalogPrice({ product, cadence, name, cents });
      logConsoleAction(admin, "billing-add-price", { detail: `${product} ${cadence.toLowerCase()} "${name}" $${(cents / 100).toFixed(2)} → ${made.id}` });
      return NextResponse.json({ success: true, variation: made });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    if (err instanceof SquareError) {
      const status = isTransientSquareError(err) ? 424 : 400;
      return NextResponse.json({ error: err.message || "Square refused the request." }, { status });
    }
    console.error("[superadmin] billing action failed", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
