import Link from "next/link";
import { prisma } from "@/lib/db";
import { PLATFORM_COMPANY_ID, usageDay } from "@/lib/usage";
import {
  platformPricingConfirmed,
  storageCostCentsPerMonth,
  usageCostCents,
} from "@/lib/platform-costs";

export const dynamic = "force-dynamic";

/**
 * Platform profitability — per-company revenue (processing fees) vs. cost
 * (AI tokens, email, SMS, storage, card buy-rate). Everything on this page is
 * derived from CompanyUsageDaily + Payment; where a FinixCostSnapshot exists
 * for a company's merchant, its actual residual is shown beside the estimate.
 */

const RANGES = [7, 30, 90] as const;

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const compact = (n: number) => Intl.NumberFormat("en-US", { notation: "compact" }).format(n);

export default async function SuperadminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = RANGES.includes(Number(params.days) as (typeof RANGES)[number])
    ? Number(params.days)
    : 30;
  const sinceDate = new Date(Date.now() - days * 86400000);
  const sinceDay = usageDay(sinceDate);

  const [companies, usage, latestStorage, payments, processed, snapshots] = await Promise.all([
    prisma.company.findMany({
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
      _sum: {
        aiCalls: true,
        aiTokensIn: true,
        aiTokensOut: true,
        aiTokensCached: true,
        emailsSent: true,
        smsSent: true,
        smsSegments: true,
      },
    }),
    // Latest storage snapshot per company (whatever day it landed on).
    prisma.companyUsageDaily.findMany({
      where: { storageBytes: { not: null } },
      orderBy: { day: "desc" },
      distinct: ["companyId"],
      select: { companyId: true, storageBytes: true },
    }),
    // Complete client revenue — every payment the business recorded,
    // including cash/check/manual entries.
    prisma.payment.groupBy({
      by: ["companyId"],
      where: { paidAt: { gte: sinceDate } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    // The card/ACH slice that ran through Streamflaire Payments (fees live here).
    prisma.payment.groupBy({
      by: ["companyId"],
      where: { paidAt: { gte: sinceDate }, processorRef: { not: null } },
      _sum: { amount: true, feeCents: true, estCostCents: true },
      _count: { _all: true },
    }),
    prisma.finixCostSnapshot.findMany({
      where: { month: { gte: sinceDay.slice(0, 7) } },
      select: { finixMerchantId: true, residualCents: true },
    }),
  ]);

  const usageBy = new Map(usage.map((u) => [u.companyId, u._sum]));
  const storageBy = new Map(latestStorage.map((s) => [s.companyId, Number(s.storageBytes ?? 0)]));
  const paymentsBy = new Map(payments.map((p) => [p.companyId, p]));
  const processedBy = new Map(processed.map((p) => [p.companyId, p]));
  const residualBy = new Map<string, number>();
  for (const s of snapshots) {
    residualBy.set(
      s.finixMerchantId,
      (residualBy.get(s.finixMerchantId) ?? 0) + Number(s.residualCents)
    );
  }

  const rows = companies.map((c) => {
    const u = usageBy.get(c.id);
    const p = paymentsBy.get(c.id);
    const proc = processedBy.get(c.id);
    const storageBytes = storageBy.get(c.id) ?? 0;
    const aiCost = u
      ? usageCostCents({
          aiTokensIn: u.aiTokensIn ?? 0,
          aiTokensOut: u.aiTokensOut ?? 0,
          aiTokensCached: u.aiTokensCached ?? 0,
          emailsSent: 0,
          smsSegments: 0,
        })
      : 0;
    const commsCost = u
      ? usageCostCents({
          aiTokensIn: 0,
          aiTokensOut: 0,
          aiTokensCached: 0,
          emailsSent: u.emailsSent ?? 0,
          smsSegments: u.smsSegments ?? 0,
        })
      : 0;
    const storageCost = (storageCostCentsPerMonth(storageBytes) * days) / 30;
    const processingCost = proc?._sum.estCostCents ?? 0;
    const revenue = proc?._sum.feeCents ?? 0;
    const totalCost = aiCost + commsCost + storageCost + processingCost;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      suspended: Boolean(c.suspendedAt),
      // Underwriting status chip: APPROVED companies show nothing (the normal
      // case); everyone else is either stuck in the funnel or exempted.
      payments: c.paymentsWaived
        ? { label: "Waived", tone: "bg-purple-50 text-purple-600" }
        : c.finixOnboardingState === "APPROVED"
          ? null
          : c.finixOnboardingState === "REJECTED"
            ? { label: "KYC rejected", tone: "bg-red-50 text-red-600" }
            : c.finixOnboardingState
              ? { label: "KYC pending", tone: "bg-amber-50 text-amber-600" }
              : { label: "Not verified", tone: "bg-gray-100 text-gray-500" },
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
    ? usageCostCents({
        aiTokensIn: platform.aiTokensIn ?? 0,
        aiTokensOut: platform.aiTokensOut ?? 0,
        aiTokensCached: platform.aiTokensCached ?? 0,
        emailsSent: platform.emailsSent ?? 0,
        smsSegments: platform.smsSegments ?? 0,
      })
    : 0;

  const totals = rows.reduce(
    (t, r) => ({
      revenue: t.revenue + r.revenue,
      cost: t.cost + r.totalCost,
      collected: t.collected + r.collectedCents,
      processed: t.processed + r.processedCents,
    }),
    { revenue: 0, cost: platformCost, collected: 0, processed: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold text-gray-900">
          Business profitability — last {days} days
        </h1>
        <nav className="flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/superadmin?days=${r}`}
              className={`rounded px-2 py-1 font-medium ${r === days ? "bg-[#0B57D8] text-white" : "text-gray-500 hover:text-gray-900"}`}
            >
              {r}d
            </Link>
          ))}
        </nav>
        {!platformPricingConfirmed() && (
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
            Estimated pricing
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Client revenue (all methods)", usd(totals.collected), ""],
          ["Card/ACH processed", usd(totals.processed), ""],
          ["Fee revenue", usd(totals.revenue), "text-[#0B57D8]"],
          ["Total cost", usd(Math.round(totals.cost)), ""],
          [
            "Net",
            usd(Math.round(totals.revenue - totals.cost)),
            totals.revenue - totals.cost >= 0 ? "text-emerald-600" : "text-red-600",
          ],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs text-gray-500">{label}</div>
            <div className={`mt-1 text-xl font-extrabold tabular-nums ${tone}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[1020px] text-sm">
          <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Company</th>
              <th className="px-3 py-2 text-right font-medium">Collected (all)</th>
              <th className="px-3 py-2 text-right font-medium">Card/ACH</th>
              <th className="px-3 py-2 text-right font-medium">Fee revenue</th>
              <th className="px-3 py-2 text-right font-medium">Card cost (est)</th>
              <th className="px-3 py-2 text-right font-medium">AI</th>
              <th className="px-3 py-2 text-right font-medium">Email / SMS</th>
              <th className="px-3 py-2 text-right font-medium">Storage</th>
              <th className="px-3 py-2 text-right font-medium">Net</th>
              <th className="px-3 py-2 text-right font-medium">Finix actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-blue-50/40">
                <td className="px-3 py-2">
                  <Link href={`/superadmin/company/${r.id}`} className="group block">
                    <div className="font-medium text-gray-900 group-hover:text-[#0B57D8]">
                      {r.name}
                      {r.suspended && (
                        <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-red-600">
                          Suspended
                        </span>
                      )}
                      {r.payments && (
                        <span
                          className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide ${r.payments.tone}`}
                        >
                          {r.payments.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">/{r.slug}</div>
                  </Link>
                </td>
                <td className="tabular-nums px-3 py-2 text-right">
                  {usd(r.collectedCents)}
                  <div className="text-xs font-normal text-gray-400">
                    {r.collectedCount} payments
                  </div>
                </td>
                <td className="tabular-nums px-3 py-2 text-right">
                  {usd(r.processedCents)}
                  <div className="text-xs font-normal text-gray-400">
                    {r.collectedCents > 0
                      ? `${Math.round((r.processedCents / r.collectedCents) * 100)}% of collected`
                      : "—"}
                  </div>
                </td>
                <td className="tabular-nums px-3 py-2 text-right text-[#0B57D8]">
                  {usd(r.revenue)}
                </td>
                <td className="tabular-nums px-3 py-2 text-right">{usd(r.processingCost)}</td>
                <td className="tabular-nums px-3 py-2 text-right">
                  {usd(Math.round(r.aiCost * 100) / 100)}
                  <div className="text-xs font-normal text-gray-400">
                    {r.aiCalls} calls · {compact(r.aiTokens)} tok
                  </div>
                </td>
                <td className="tabular-nums px-3 py-2 text-right">
                  {usd(Math.round(r.commsCost * 100) / 100)}
                  <div className="text-xs font-normal text-gray-400">
                    {r.emails} em · {r.sms} sms
                  </div>
                </td>
                <td className="tabular-nums px-3 py-2 text-right">
                  {usd(Math.round(r.storageCost * 100) / 100)}
                  <div className="text-xs font-normal text-gray-400">
                    {(r.storageBytes / 1_048_576).toFixed(1)} MB
                  </div>
                </td>
                <td
                  className={`tabular-nums px-3 py-2 text-right font-semibold ${r.net >= 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {usd(Math.round(r.net))}
                </td>
                <td className="tabular-nums px-3 py-2 text-right text-gray-600">
                  {r.finixResidual !== undefined ? usd(r.finixResidual) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        Platform overhead (unattributed emails/AI — password resets, portal logins):{" "}
        {usd(Math.round(platformCost * 100) / 100)} in this range. Collected = every payment the
        business recorded, including cash and check; Card/ACH = the slice that ran through
        Streamflaire Payments, which is where fee revenue comes from. Fee revenue is computed
        from the fee profile at charge time; card cost is an interchange estimate until the
        monthly Finix Net Profit report is imported (Finix actual column).
        {!platformPricingConfirmed() &&
          " Unit prices are ballpark defaults — set COST_* / FINIX_* env vars and PLATFORM_PRICING_CONFIRMED=1 once vendor pricing is finalized."}
      </p>
    </div>
  );
}
