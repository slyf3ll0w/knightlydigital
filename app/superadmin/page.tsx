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

  const [companies, usage, latestStorage, payments, snapshots] = await Promise.all([
    prisma.company.findMany({
      select: { id: true, name: true, slug: true, createdAt: true, finixMerchantId: true },
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
    prisma.payment.groupBy({
      by: ["companyId"],
      where: { paidAt: { gte: sinceDate } },
      _sum: { amount: true, feeCents: true, estCostCents: true },
      _count: { _all: true },
    }),
    prisma.finixCostSnapshot.findMany({
      where: { month: { gte: sinceDay.slice(0, 7) } },
      select: { finixMerchantId: true, residualCents: true, interchangeFeesCents: true },
    }),
  ]);

  const usageBy = new Map(usage.map((u) => [u.companyId, u._sum]));
  const storageBy = new Map(latestStorage.map((s) => [s.companyId, Number(s.storageBytes ?? 0)]));
  const paymentsBy = new Map(payments.map((p) => [p.companyId, p]));
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
    const processingCost = p?._sum.estCostCents ?? 0;
    const revenue = p?._sum.feeCents ?? 0;
    const totalCost = aiCost + commsCost + storageCost + processingCost;
    return {
      id: c.id,
      name: c.name,
      slug: c.slug,
      volumeCents: Math.round(Number(p?._sum.amount ?? 0) * 100),
      paymentCount: p?._count._all ?? 0,
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
      volume: t.volume + r.volumeCents,
    }),
    { revenue: 0, cost: platformCost, volume: 0 }
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-bold">Business profitability — last {days} days</h1>
        <nav className="flex gap-1 rounded-md border border-stone-800 p-0.5 text-xs">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/superadmin?days=${r}`}
              className={`rounded px-2 py-1 ${r === days ? "bg-stone-700 text-white" : "text-stone-400 hover:text-white"}`}
            >
              {r}d
            </Link>
          ))}
        </nav>
        {!platformPricingConfirmed() && (
          <span className="rounded border border-amber-600/50 bg-amber-950/50 px-2 py-1 text-xs text-amber-400">
            Estimated pricing — set COST_* / FINIX_* env vars and PLATFORM_PRICING_CONFIRMED=1
            once vendor pricing is finalized
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Processing volume", usd(totals.volume)],
          ["Fee revenue", usd(totals.revenue)],
          ["Total cost", usd(Math.round(totals.cost))],
          ["Net", usd(Math.round(totals.revenue - totals.cost))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-stone-800 bg-stone-900 p-3">
            <div className="text-xs text-stone-400">{label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-stone-900 text-left text-xs text-stone-400">
            <tr>
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2 text-right">Volume</th>
              <th className="px-3 py-2 text-right">Fee revenue</th>
              <th className="px-3 py-2 text-right">Card cost (est)</th>
              <th className="px-3 py-2 text-right">AI</th>
              <th className="px-3 py-2 text-right">Email / SMS</th>
              <th className="px-3 py-2 text-right">Storage</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-right">Finix actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800/60">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-stone-900/50">
                <td className="px-3 py-2">
                  <div className="font-medium text-white">{r.name}</div>
                  <div className="text-xs text-stone-500">/{r.slug}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {usd(r.volumeCents)}
                  <div className="text-xs text-stone-500">{r.paymentCount} payments</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                  {usd(r.revenue)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(r.processingCost)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {usd(Math.round(r.aiCost * 100) / 100)}
                  <div className="text-xs text-stone-500">
                    {r.aiCalls} calls · {compact(r.aiTokens)} tok
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {usd(Math.round(r.commsCost * 100) / 100)}
                  <div className="text-xs text-stone-500">
                    {r.emails} em · {r.sms} sms
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {usd(Math.round(r.storageCost * 100) / 100)}
                  <div className="text-xs text-stone-500">
                    {(r.storageBytes / 1_048_576).toFixed(1)} MB
                  </div>
                </td>
                <td
                  className={`px-3 py-2 text-right font-semibold tabular-nums ${r.net >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {usd(Math.round(r.net))}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-stone-300">
                  {r.finixResidual !== undefined ? usd(r.finixResidual) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-stone-500">
        Platform overhead (unattributed emails/AI — password resets, portal logins):{" "}
        {usd(Math.round(platformCost * 100) / 100)} in this range. Fee revenue is computed from
        the fee profile at charge time; card cost is an interchange estimate until the monthly
        Finix Net Profit report is imported (Finix actual column).
      </p>
    </div>
  );
}
