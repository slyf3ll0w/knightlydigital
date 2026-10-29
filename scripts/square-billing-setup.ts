/**
 * Create (or find) WorkBench's subscription plans in OUR Square account and
 * print the env lines plan billing needs (lib/plan-billing.ts).
 *
 *   SQUARE_ENVIRONMENT=sandbox SQUARE_BILLING_ACCESS_TOKEN=EAAA… npx tsx scripts/square-billing-setup.ts
 *   … then again with SQUARE_ENVIRONMENT=production and the production token.
 *
 * Idempotent: plans are matched by name ("WorkBench Voice", …) and variations
 * by name within the plan ("Monthly" / "Annual"), so re-running after a
 * price change in lib/plans.ts creates a NEW variation only when the price
 * differs (Square plan variations are immutable once sold against —
 * existing subscribers keep theirs, new sign-ups get the new id). Prices come
 * from lib/plans.ts, never typed here. Nothing is deleted.
 *
 * Needs the account's own access token (Developer Console → the WorkBench
 * application → Credentials → Access token for the matching environment).
 * Prints DATABASE_URL-free: this script never touches our database.
 */
import {
  BILLING_PRODUCTS,
  productName,
  productPriceCents,
  productSellable,
  type BillingCadence,
  type BillingProduct,
} from "../lib/plans";
import { variationEnvName } from "../lib/plan-subscriptions";
import {
  listSquareSubscriptionPlans,
  retrieveSquareCatalogObject,
  upsertSquareCatalogObject,
  type SquareCatalogObject,
} from "../lib/square-billing-api";

const token = (process.env.SQUARE_BILLING_ACCESS_TOKEN ?? "").trim();
if (!token) {
  console.error("Set SQUARE_BILLING_ACCESS_TOKEN (our account's token for SQUARE_ENVIRONMENT).");
  process.exit(1);
}
const env = process.env.SQUARE_ENVIRONMENT === "production" ? "production" : "sandbox";

const CADENCES: Record<BillingProduct, BillingCadence[]> = {
  DISPATCH: ["MONTHLY", "ANNUAL"],
  SHOP: ["MONTHLY", "ANNUAL"],
  JOBSITE: ["MONTHLY", "ANNUAL"],
  FULL_SHOP: ["MONTHLY", "ANNUAL"],
  SEAT: ["MONTHLY"],
};

function planTitle(product: BillingProduct): string {
  return `WorkBench ${productName(product)}`;
}

function variationTitle(cadence: BillingCadence): string {
  return cadence === "ANNUAL" ? "Annual" : "Monthly";
}

function squareCadence(cadence: BillingCadence): string {
  return cadence === "ANNUAL" ? "ANNUAL" : "MONTHLY";
}

async function main() {
  console.log(`Square ${env} — subscription plans from lib/plans.ts`);
  const existing = await listSquareSubscriptionPlans(token);
  const lines: string[] = [];

  for (const product of BILLING_PRODUCTS) {
    if (!productSellable(product)) {
      console.log(`· ${planTitle(product)}: coming soon — skipped`);
      continue;
    }
    let plan = existing.find((o) => !o.is_deleted && o.subscription_plan_data?.name === planTitle(product));
    if (!plan) {
      const r = await upsertSquareCatalogObject(token, `wb-plan:${env}:${product}`, {
        type: "SUBSCRIPTION_PLAN",
        id: `#plan-${product}`,
        subscription_plan_data: { name: planTitle(product), all_items: true },
      });
      plan = r.object;
      console.log(`+ created plan ${planTitle(product)} (${plan.id})`);
    } else {
      console.log(`· plan ${planTitle(product)} (${plan.id})`);
    }
    // Re-read: the list call doesn't carry the variations.
    const full = await retrieveSquareCatalogObject(token, plan.id);
    const variations: SquareCatalogObject[] = full.subscription_plan_data?.subscription_plan_variations ?? [];

    for (const cadence of CADENCES[product]) {
      const price = productPriceCents(product, cadence);
      const match = variations.find((v) => {
        const d = v.subscription_plan_variation_data;
        const phase = d?.phases?.[0];
        return (
          !v.is_deleted &&
          d?.name === variationTitle(cadence) &&
          phase?.cadence === squareCadence(cadence) &&
          phase?.pricing?.type === "STATIC" &&
          phase?.pricing?.price_money?.amount === price
        );
      });
      let id = match?.id;
      if (!id) {
        const stale = variations.find((v) => v.subscription_plan_variation_data?.name === variationTitle(cadence) && !v.is_deleted);
        const name = stale ? `${variationTitle(cadence)} (${(price / 100).toFixed(0)})` : variationTitle(cadence);
        const r = await upsertSquareCatalogObject(token, `wb-var:${env}:${product}:${cadence}:${price}`, {
          type: "SUBSCRIPTION_PLAN_VARIATION",
          id: `#var-${product}-${cadence}`,
          subscription_plan_variation_data: {
            name,
            subscription_plan_id: plan.id,
            phases: [
              {
                cadence: squareCadence(cadence),
                ordinal: 0,
                pricing: { type: "STATIC", price_money: { amount: price, currency: "USD" } },
              },
            ],
          },
        });
        id = r.object.id;
        console.log(`  + created ${name} $${(price / 100).toFixed(2)} → ${id}${stale ? `  (old "${variationTitle(cadence)}" ${stale.id} kept for its subscribers)` : ""}`);
      } else {
        console.log(`  · ${variationTitle(cadence)} $${(price / 100).toFixed(2)} → ${id}`);
      }
      lines.push(`${variationEnvName(product, cadence)}=${id}`);
    }
  }

  console.log("\nSet these on Railway (and in .env for local):\n");
  for (const l of lines) console.log(l);
  console.log(
    "\nAlso needed: SQUARE_BILLING_LOCATION_ID (Square Dashboard → Account & Settings → Locations), " +
      "SQUARE_BILLING_WEBHOOK_SIGNATURE_KEY (Developer Console → Webhooks → a subscription on " +
      `\${NEXTAUTH_URL}/api/public/webhooks/square-billing for subscription.created, subscription.updated, ` +
      "invoice.payment_made, invoice.scheduled_charge_failed, invoice.updated)."
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
