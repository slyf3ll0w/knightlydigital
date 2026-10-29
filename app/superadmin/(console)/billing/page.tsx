import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import { planBillingCredentials } from "@/lib/plan-billing-env";
import { catalogVariations } from "@/lib/plan-catalog";
import { BILLING_PRODUCTS, formatCents, productName, productPriceCents, productSellable } from "@/lib/plans";
import { Card, Chip, DsPage, PageHeader, SectionTitle } from "@/components/ds";
import { fullDate } from "@/lib/console-format";
import BillingClient from "./BillingClient";

export const dynamic = "force-dynamic";

/**
 * Console → Billing: the plans as they exist in WorkBench's own Square
 * account (lib/plan-catalog.ts) and every subscription filed from it
 * (PlanSubscription). Prices are made here; offering one to a company and
 * starting it by invoice happen on that company's Plans card.
 */
export default async function ConsoleBillingPage() {
  await requireSuperadminPage();
  const creds = await planBillingCredentials().catch(() => null);
  const catalog = creds ? await catalogVariations().catch(() => []) : [];
  const [subscriptions, platform] = await Promise.all([
    prisma.planSubscription.findMany({
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { company: { select: { id: true, name: true } } },
    }),
    prisma.company.findFirst({ where: { isPlatform: true }, select: { id: true, name: true, squareConnectedAt: true } }),
  ]);
  const products = BILLING_PRODUCTS.filter((p) => productSellable(p)).map((p) => ({ id: p, name: productName(p) }));
  const label = (product: string) => (product === "SEAT" ? "Extra person" : productName(product as (typeof BILLING_PRODUCTS)[number]));
  const listPrice = (product: string, cadence: string) => {
    try {
      return productPriceCents(product as (typeof BILLING_PRODUCTS)[number], cadence === "ANNUAL" ? "ANNUAL" : "MONTHLY");
    } catch {
      return null;
    }
  };

  return (
    <DsPage>
      <PageHeader
        eyebrow="Money"
        title="Billing"
        info={
          <>
            WorkBench&apos;s own plans in Square: every price in the catalog and every subscription filed from it. Prices
            are read from Square by plan name (Voice, Pro, Max, Extra person) — make one here or in the Square
            Dashboard, then offer it to a company from that company&apos;s Plans card.
          </>
        }
      />

      <div className="mt-6 grid gap-4">
        {!creds ? (
          <Card className="p-5">
            <p className="text-sm text-[color:var(--ds-ink)]">
              Plan billing isn&apos;t set up yet.{" "}
              {platform ? (
                <>
                  <Link href={`/superadmin/company/${platform.id}`} className="font-semibold underline">
                    {platform.name}
                  </Link>{" "}
                  is WorkBench&apos;s own account but has no Square connection — connect Square from its Settings → Payments.
                </>
              ) : (
                <>Open the WorkBench company and press &quot;Make WorkBench&apos;s account&quot;, then connect Square from its Settings → Payments.</>
              )}
            </p>
          </Card>
        ) : (
          <>
            <BillingClient products={products} />

            <Card className="p-5">
              <SectionTitle>Prices in Square</SectionTitle>
              {catalog.length === 0 ? (
                <p className="ds-small mt-2">No plan variations found. Add a price above, or make plans in the Square Dashboard.</p>
              ) : (
                <ul className="ds-divide mt-3 overflow-hidden rounded-xl bg-[color:var(--ds-surface-2)]">
                  {catalog.map((v) => {
                    const list = listPrice(v.product, v.cadence);
                    const isList = list != null && v.priceCents === list;
                    return (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-[13px] font-semibold text-[color:var(--ds-ink)]">{label(v.product)}</span>
                          <span className="ds-small">
                            {v.name}
                            {v.planName && v.planName !== v.name ? ` · ${v.planName}` : ""} · {v.cadence === "ANNUAL" ? "annual" : "monthly"}
                          </span>
                          {isList ? <Chip tone="primary">List price</Chip> : <Chip tone="neutral">Offer only</Chip>}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[13px] font-semibold text-[color:var(--ds-ink)]">
                            {v.priceCents == null ? "—" : `${formatCents(v.priceCents)}/${v.cadence === "ANNUAL" ? "yr" : "mo"}`}
                          </span>
                          <code className="ds-small">{v.id}</code>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <SectionTitle>Subscriptions</SectionTitle>
              {subscriptions.length === 0 ? (
                <p className="ds-small mt-2">None yet. Start one from a company&apos;s Plans card (&quot;Send by invoice&quot;) or let the owner buy on Settings → Plans.</p>
              ) : (
                <ul className="ds-divide mt-3 overflow-hidden rounded-xl bg-[color:var(--ds-surface-2)]">
                  {subscriptions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                        <Link href={`/superadmin/company/${s.companyId}?tab=controls`} className="text-[13px] font-semibold text-[color:var(--ds-ink)] underline-offset-2 hover:underline">
                          {s.company.name}
                        </Link>
                        <span className="ds-small">
                          {label(s.product)} · {s.cadence === "ANNUAL" ? "annual" : "monthly"}
                        </span>
                        <Chip tone={s.lastFailureAt ? "bad" : s.entitled ? "good" : "neutral"}>{s.lastFailureAt ? "Card failing" : s.status}</Chip>
                      </div>
                      <span className="ds-small">
                        {s.canceledAt ? `ends ${fullDate(s.canceledAt)}` : s.chargedThrough ? `paid through ${fullDate(s.chargedThrough)}` : `started ${fullDate(s.createdAt)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </DsPage>
  );
}
