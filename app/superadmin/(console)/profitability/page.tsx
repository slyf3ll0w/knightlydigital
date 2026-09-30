import Link from "next/link";
import { prisma } from "@/lib/db";
import { PLATFORM_COMPANY_ID, usageDay } from "@/lib/usage";
import { mapboxMonthUsage } from "@/lib/mapbox-budget";
import { platformPricingConfirmed, storageCostCentsPerMonth, usageCostCents } from "@/lib/platform-costs";
import { Card, Chip, DsPage, PageHeader, SectionTitle, Stat } from "@/components/ds";
import FinixImportForm from "@/components/console/FinixImportForm";
import { compact, mb, usd, usdFine } from "@/lib/console-format";

export const dynamic = "force-dynamic";

/**
 * Platform profitability — per-company revenue (processing fees) vs. cost
 * (AI tokens, email, SMS, storage, card buy-rate). Everything on this page is
 * derived from CompanyUsageDaily + Payment; where a FinixCostSnapshot exists
 * for a company's merchant, its actual residual is shown beside the estimate.
 * The monthly Finix Net Profit import lives at the bottom — it is the
 * true-up for this very table. Test accounts are left out.
 */

const RANGES = [7, 30, 90] as const;

export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days) as (typeof RANGES)[number]) ? Number(params.days) : 30;
  const sinceDate = new Date(Date.now() - days * 86400000);
  const sinceDay = usageDay(sinceDate);

  const [companies, usage, latestStorage, payments, processed, snapshots, allSnapshots, mapbox] = await Promise.all([
    prisma.company.findMany({
      where: { isTest: false },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        finixMerchantId: true,
        finixOnboardingState: true,
        paymentsWaived: true,
        suspendedAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.companyUsageDaily.groupBy({
      by: ["companyId"],
      where: { day: { gte: sinceDay } },
      _sum: { aiCalls: true, aiTokensIn: true, aiTokensOut: true, aiTokensCached: true, emailsSent: true, smsSent: true, smsSegments: true },
    }),
    prisma.companyUsageDaily.findMany({
      where: { storageBytes: { not: null } },
      orderBy: { day: "desc" },
      distinct: ["companyId"],
      select: { companyId: true, storageBytes: true },
    }),
    // Complete client revenue — every payment the business recorded, including cash/check/manual entries.
    prisma.payment.groupBy({ by: ["companyId"], where: { paidAt: { gte: sinceDate } }, _sum: { amount: true }, _count: { _all: true } }),
    // The card/ACH slice that ran through Streamflaire Payments (fees live here).
    prisma.payment.groupBy({
      by: ["companyId"],
      where: { paidAt: { gte: sinceDate }, processorRef: { not: null } },
      _sum: { amount: true, feeCents: true, estCostCents: true },
      _count: { _all: true },
    }),
    prisma.finixCostSnapshot.findMany({ where: { month: { gte: sinceDay.slice(0, 7) } }, select: { finixMerchantId: true, residualCents: true } }),
    prisma.finixCostSnapshot.findMany({ orderBy: [{ month: "desc" }, { finixMerchantId: "asc" }], take: 60 }),
    // Month-to-date Mapbox spend vs. the free-tier caps — always the calendar month, which is what Mapbox bills.
    mapboxMonthUsage(),
  ]);

  const usageBy = new Map(usage.map((u) => [u.companyId, u._sum]));
  const storageBy = new Map(latestStorage.map((s) => [s.companyId, Number(s.storageBytes ?? 0)]));
  const paymentsBy = new Map(payments.map((p) => [p.companyId, p]));
  const processedBy = new Map(processed.map((p) => [p.companyId, p]));
  const residualBy = new Map<string, number>();
  for (const s of snapshots) residualBy.set(s.finixMerchantId, (residualBy.get(s.finixMerchantId) ?? 0) + Number(s.residualCents));
  const merchantName = new Map(companies.filter((c) => c.finixMerchantId).map((c) => [c.finixMerchantId as string, c.name]));

  const rows = companies.map((c) => {
    const u = usageBy.get(c.id);
    const p = paymentsBy.get(c.id);
    const proc = processedBy.get(c.id);
    const storageBytes = storageBy.get(c.id) ?? 0;
    const aiCost = u ? usageCostCents({ aiTokensIn: u.aiTokensIn ?? 0, aiTokensOut: u.aiTokensOut ?? 0, aiTokensCached: u.aiTokensCached ?? 0, emailsSent: 0, smsSegments: 0 }) : 0;
    const commsCost = u ? usageCostCents({ aiTokensIn: 0, aiTokensOut: 0, aiTokensCached: 0, emailsSent: u.emailsSent ?? 0, smsSegments: u.smsSegments ?? 0 }) : 0;
    const storageCost = (storageCostCentsPerMonth(storageBytes) * days) / 30;
    const processingCost = proc?._sum.estCostCents ?? 0;
    const revenue = proc?._sum.feeCents ?? 0;
    const totalCost = aiCost + commsCost + storageCost + processingCost;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      suspended: Boolean(c.suspendedAt),
      payments: c.paymentsWaived
        ? { label: "Waived", tone: "neutral" as const }
        : c.finixOnboardingState === "APPROVED"
          ? null
          : c.finixOnboardingState === "REJECTED"
            ? { label: "KYC rejected", tone: "bad" as const }
            : c.finixOnboardingState
              ? { label: "KYC pending", tone: "warn" as const }
              : { label: "Not verified", tone: "neutral" as const },
      collectedCents: Math.round(Number(p?._sum.amount ?? 0) * 100),
      collectedCount: p?._count._all ?? 0,
      processedCents: Math.round(Number(proc?._sum.amount ?? 0) * 100),
      processedCount: proc?._count._all ?? 0,
      revenue,
      aiCalls: u?.aiCalls ?? 0,
      aiTokens: (u?.aiTokensIn ?? 0) + (u?.aiTokensOut ?? 0),
      aiCost,
      emails: u?.emailsSent ?? 0,
      sms: u?.smsSent ?? 0,
      commsCost,
      storageBytes,
      storageCost,
      processingCost,
      totalCost,
      net: revenue - totalCost,
      finixResidual: c.finixMerchantId ? residualBy.get(c.finixMerchantId) : undefined,
    };
  });
  rows.sort((a, b) => b.net - a.net);

  // Unattributed sends (password resets etc.) — platform overhead, not a tenant.
  const platform = usageBy.get(PLATFORM_COMPANY_ID);
  const platformCost = platform
    ? usageCostCents({ aiTokensIn: platform.aiTokensIn ?? 0, aiTokensOut: platform.aiTokensOut ?? 0, aiTokensCached: platform.aiTokensCached ?? 0, emailsSent: platform.emailsSent ?? 0, smsSegments: platform.smsSegments ?? 0 })
    : 0;

  const totals = rows.reduce(
    (t, r) => ({ revenue: t.revenue + r.revenue, cost: t.cost + r.totalCost, collected: t.collected + r.collectedCents, processed: t.processed + r.processedCents }),
    { revenue: 0, cost: platformCost, collected: 0, processed: 0 }
  );
  const net = totals.revenue - totals.cost;
  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;
  const capTone = (n: number, max: number) => (max > 0 && n >= max * 0.8 ? "warn" : "neutral");

  return (
    <DsPage>
      <PageHeader
        eyebrow={`Last ${days} days`}
        title="Profitability"
        info={
          <>
            Collected is every payment a business recorded, including cash and check. Card/ACH is the slice that ran
            through Streamflaire Payments, which is where fee revenue comes from. Fee revenue is computed from the fee
            profile at charge time. Card cost is an interchange estimate until the monthly Finix Net Profit report is
            imported below (the Finix actual column). Platform overhead of {usdFine(platformCost)} (unattributed
            emails and AI, like password resets) is counted in total cost. Test accounts are excluded.
            {!platformPricingConfirmed() && " Unit prices are ballpark defaults until COST_* / FINIX_* env vars and PLATFORM_PRICING_CONFIRMED=1 are set."}
          </>
        }
        actions={
          <span className="flex items-center gap-3">
            {!platformPricingConfirmed() && <Chip tone="warn">Estimated pricing</Chip>}
            <nav className="flex gap-1" aria-label="Range">
              {RANGES.map((r) => (
                <Link key={r} prefetch={false} href={`/superadmin/profitability?days=${r}`} className={`ds-btn ds-btn-sm ${r === days ? "ds-btn-soft" : "ds-btn-ghost"}`} aria-current={r === days ? "page" : undefined}>
                  {r} d
                </Link>
              ))}
            </nav>
          </span>
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat className="ds-rise" style={rise(1)} label="Client revenue" value={usd(totals.collected)} foot="all payment methods" />
        <Stat className="ds-rise" style={rise(2)} label="Card / ACH" value={usd(totals.processed)} foot="through Streamflaire Payments" />
        <Stat className="ds-rise" style={rise(3)} label="Fee revenue" value={usd(totals.revenue)} foot="ours, at charge time" />
        <Stat className="ds-rise" style={rise(4)} label="Total cost" value={usd(Math.round(totals.cost))} foot="AI, comms, storage, card" />
        <Stat className="ds-rise" style={rise(5)} label="Net" value={usd(Math.round(net))} tone={net >= 0 ? "good" : "bad"} foot={platformPricingConfirmed() ? undefined : "estimated"} />
      </div>

      <SectionTitle className="mt-8">By account</SectionTitle>
      <Card className="ds-rise overflow-x-auto" style={rise(6)}>
        <table className="w-full min-w-[1040px] text-[13.5px]">
          <thead>
            <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
              <th className="px-4 py-2.5 font-medium">Account</th>
              <th className="px-3 py-2.5 text-right font-medium">Collected</th>
              <th className="px-3 py-2.5 text-right font-medium">Card / ACH</th>
              <th className="px-3 py-2.5 text-right font-medium">Fee revenue</th>
              <th className="px-3 py-2.5 text-right font-medium">Card cost</th>
              <th className="px-3 py-2.5 text-right font-medium">AI</th>
              <th className="px-3 py-2.5 text-right font-medium">Email / SMS</th>
              <th className="px-3 py-2.5 text-right font-medium">Storage</th>
              <th className="px-3 py-2.5 text-right font-medium">Net</th>
              <th className="px-3 py-2.5 text-right font-medium">Finix actual</th>
            </tr>
          </thead>
          <tbody className="ds-divide">
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="ds-small px-4 py-8 text-center">
                  No live accounts yet.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-[color:var(--ds-surface-2)]">
                <td className="px-4 py-2.5">
                  <Link prefetch={false} href={`/superadmin/company/${r.id}?tab=money`} className="group block min-w-0">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-medium text-[color:var(--ds-ink)] group-hover:text-[color:var(--ds-primary)]">{r.name}</span>
                      {r.suspended && <Chip tone="bad">Suspended</Chip>}
                      {r.payments && <Chip tone={r.payments.tone}>{r.payments.label}</Chip>}
                    </span>
                    <span className="ds-small block">/{r.slug}</span>
                  </Link>
                </td>
                <td className="ds-num px-3 py-2.5 text-right">
                  {usd(r.collectedCents)}
                  <span className="ds-small block">{r.collectedCount} payments</span>
                </td>
                <td className="ds-num px-3 py-2.5 text-right">
                  {usd(r.processedCents)}
                  <span className="ds-small block">{r.collectedCents > 0 ? `${Math.round((r.processedCents / r.collectedCents) * 100)}% of collected` : "—"}</span>
                </td>
                <td className="ds-num px-3 py-2.5 text-right text-[color:var(--ds-primary)]">{usd(r.revenue)}</td>
                <td className="ds-num px-3 py-2.5 text-right">{usd(r.processingCost)}</td>
                <td className="ds-num px-3 py-2.5 text-right">
                  {usdFine(r.aiCost)}
                  <span className="ds-small block">
                    {r.aiCalls} calls · {compact(r.aiTokens)} tok
                  </span>
                </td>
                <td className="ds-num px-3 py-2.5 text-right">
                  {usdFine(r.commsCost)}
                  <span className="ds-small block">
                    {r.emails} em · {r.sms} sms
                  </span>
                </td>
                <td className="ds-num px-3 py-2.5 text-right">
                  {usdFine(r.storageCost)}
                  <span className="ds-small block">{mb(r.storageBytes)}</span>
                </td>
                <td className="ds-num px-3 py-2.5 text-right font-semibold" style={{ color: r.net >= 0 ? "var(--ds-good)" : "var(--ds-bad)" }}>
                  {usd(Math.round(r.net))}
                </td>
                <td className="ds-num px-3 py-2.5 text-right text-[color:var(--ds-ink-2)]">{r.finixResidual !== undefined ? usd(r.finixResidual) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle
        className="mt-8"
        info="The free-tier caps for Mapbox (Routes) this calendar month. At a cap the Route Manager falls back to estimates for the rest of the month and says so on the routes page; a single tenant is paused first (MAPBOX_TENANT_* caps) so one busy company never spends everyone else's month. Road legs are cached 45 days."
      >
        Mapbox this month
      </SectionTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Geocodes", mapbox.geocodeCalls, mapbox.geocodeCap],
          ["Matrix elements", mapbox.matrixElements, mapbox.matrixCap],
          ["Directions", mapbox.directionsCalls, mapbox.directionsCap],
        ].map(([label, n, max]) => (
          <Card key={String(label)} className="p-5">
            <p className="ds-label">{label}</p>
            <p className="ds-value mt-2 text-[24px]">
              {compact(Number(n))} <span className="ds-small">/ {compact(Number(max))}</span>
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--ds-line)]">
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round((Number(n) / Math.max(1, Number(max))) * 100))}%`, background: capTone(Number(n), Number(max)) === "warn" ? "var(--ds-warn)" : "var(--ds-primary)" }} />
            </div>
          </Card>
        ))}
      </div>

      <div id="finix" />
      <SectionTitle
        className="mt-10"
        info="Finix has no report API. Around the 10th–15th, download the prior month's Net Profit report from the Finix dashboard and drop the CSV here. Rows are matched to accounts by merchant ID and become the Finix actual column above; re-uploading a month overwrites it."
      >
        Finix Net Profit import
      </SectionTitle>
      <Card className="p-5">
        <FinixImportForm />
      </Card>
      {allSnapshots.length > 0 && (
        <Card className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
                <th className="px-4 py-2.5 font-medium">Month</th>
                <th className="px-3 py-2.5 font-medium">Merchant</th>
                <th className="px-3 py-2.5 text-right font-medium">Card sales</th>
                <th className="px-3 py-2.5 text-right font-medium">Fees billed</th>
                <th className="px-3 py-2.5 text-right font-medium">Interchange</th>
                <th className="px-3 py-2.5 text-right font-medium">Residual</th>
              </tr>
            </thead>
            <tbody className="ds-divide">
              {allSnapshots.map((s) => (
                <tr key={s.id}>
                  <td className="ds-num px-4 py-2.5">{s.month}</td>
                  <td className="px-3 py-2.5">{merchantName.get(s.finixMerchantId) ?? <span className="ds-small">{s.finixMerchantId}</span>}</td>
                  <td className="ds-num px-3 py-2.5 text-right">{usd(Number(s.cardSaleCents))}</td>
                  <td className="ds-num px-3 py-2.5 text-right">{usd(Number(s.cardFeesCents))}</td>
                  <td className="ds-num px-3 py-2.5 text-right">{usd(Number(s.interchangeFeesCents))}</td>
                  <td className="ds-num px-3 py-2.5 text-right font-semibold text-[color:var(--ds-good)]">{usd(Number(s.residualCents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </DsPage>
  );
}
