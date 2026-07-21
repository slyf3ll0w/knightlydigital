import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usageDay } from "@/lib/usage";
import {
  platformPricingConfirmed,
  storageCostCentsPerMonth,
  usageCostCents,
} from "@/lib/platform-costs";
import { AccountActions } from "./AccountActions";

export const dynamic = "force-dynamic";

/**
 * Per-client profitability report: month-by-month revenue vs. cost for one
 * company, the cost mix, and estimate-vs-actual once Finix Net Profit
 * snapshots exist for its merchant. Account controls (suspend / delete)
 * live at the bottom.
 */

const RANGES = [
  { key: "3", months: 3, label: "3 mo" },
  { key: "12", months: 12, label: "12 mo" },
  { key: "all", months: 120, label: "All time" },
] as const;

const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const usdFine = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  });
const compact = (n: number) => Intl.NumberFormat("en-US", { notation: "compact" }).format(n);

type MonthRow = {
  month: string;
  collectedCents: number; // every payment method, incl. cash/check
  collectedCount: number;
  processedCents: number; // card/ACH through Streamflaire Payments
  processedCount: number;
  feeCents: number;
  cardCostCents: number;
  aiCostCents: number;
  commsCostCents: number;
  storageCostCents: number;
  aiTokens: number;
  emails: number;
  sms: number;
  finixResidualCents?: number;
};

export default async function CompanyReport({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { id } = await params;
  const { range: rangeKey } = await searchParams;
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];

  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      finixMerchantId: true,
      industry: true,
      suspendedAt: true,
      suspendedReason: true,
    },
  });
  if (!company) notFound();

  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - range.months);
  const sinceDay = usageDay(sinceDate);
  const sinceMonth = sinceDay.slice(0, 7);

  const [usage, payments, snapshots, users, contacts, jobs, invoices, paymentCountAll] =
    await Promise.all([
      prisma.companyUsageDaily.findMany({
        where: { companyId: id, day: { gte: sinceDay } },
        orderBy: { day: "asc" },
      }),
      prisma.payment.findMany({
        where: { companyId: id, paidAt: { gte: sinceDate } },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          amount: true,
          method: true,
          feeCents: true,
          estCostCents: true,
          cardBrand: true,
          cardType: true,
          processorRef: true,
          paidAt: true,
        },
      }),
      company.finixMerchantId
        ? prisma.finixCostSnapshot.findMany({
            where: { finixMerchantId: company.finixMerchantId, month: { gte: sinceMonth } },
          })
        : Promise.resolve([]),
      prisma.user.count({ where: { companyId: id } }),
      prisma.contact.count({ where: { companyId: id } }),
      prisma.job.count({ where: { companyId: id } }),
      prisma.invoice.count({ where: { companyId: id } }),
      prisma.payment.count({ where: { companyId: id } }),
    ]);

  const footprint = {
    users,
    contacts,
    jobs,
    invoices,
    payments: paymentCountAll,
    large: paymentCountAll > 0 || contacts > 25 || jobs > 25,
  };

  // ── Month-by-month rollup ──────────────────────────────────────────────────
  const months = new Map<string, MonthRow>();
  const monthRow = (month: string): MonthRow => {
    let row = months.get(month);
    if (!row) {
      row = {
        month,
        collectedCents: 0,
        collectedCount: 0,
        processedCents: 0,
        processedCount: 0,
        feeCents: 0,
        cardCostCents: 0,
        aiCostCents: 0,
        commsCostCents: 0,
        storageCostCents: 0,
        aiTokens: 0,
        emails: 0,
        sms: 0,
      };
      months.set(month, row);
    }
    return row;
  };

  // Storage: price each month at that month's latest snapshot level.
  const latestStorageByMonth = new Map<string, number>();
  for (const u of usage) {
    const m = u.day.slice(0, 7);
    const row = monthRow(m);
    row.aiCostCents += usageCostCents({
      aiTokensIn: u.aiTokensIn,
      aiTokensOut: u.aiTokensOut,
      aiTokensCached: u.aiTokensCached,
      emailsSent: 0,
      smsSegments: 0,
    });
    row.commsCostCents += usageCostCents({
      aiTokensIn: 0,
      aiTokensOut: 0,
      aiTokensCached: 0,
      emailsSent: u.emailsSent,
      smsSegments: u.smsSegments,
    });
    row.aiTokens += u.aiTokensIn + u.aiTokensOut;
    row.emails += u.emailsSent;
    row.sms += u.smsSent;
    if (u.storageBytes !== null) latestStorageByMonth.set(m, Number(u.storageBytes));
  }
  for (const [m, bytes] of latestStorageByMonth) {
    monthRow(m).storageCostCents = storageCostCentsPerMonth(bytes);
  }
  for (const p of payments) {
    const row = monthRow(p.paidAt.toISOString().slice(0, 7));
    const cents = Math.round(Number(p.amount) * 100);
    row.collectedCents += cents;
    row.collectedCount += 1;
    if (p.processorRef) {
      row.processedCents += cents;
      row.processedCount += 1;
      row.feeCents += p.feeCents ?? 0;
      row.cardCostCents += p.estCostCents ?? 0;
    }
  }
  for (const s of snapshots) {
    monthRow(s.month).finixResidualCents = Number(s.residualCents);
  }

  const rows = [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  const totals = rows.reduce(
    (t, r) => {
      const cost = r.cardCostCents + r.aiCostCents + r.commsCostCents + r.storageCostCents;
      return {
        collected: t.collected + r.collectedCents,
        processed: t.processed + r.processedCents,
        revenue: t.revenue + r.feeCents,
        cost: t.cost + cost,
      };
    },
    { collected: 0, processed: 0, revenue: 0, cost: 0 }
  );
  const latestStorageBytes =
    [...usage].reverse().find((u) => u.storageBytes !== null)?.storageBytes ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/superadmin" className="text-sm text-gray-400 hover:text-gray-900">
          ← All companies
        </Link>
        <h1 className="text-lg font-bold text-gray-900">{company.name}</h1>
        {company.suspendedAt && (
          <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-red-600">
            Suspended
          </span>
        )}
        <span className="text-xs text-gray-400">
          /{company.slug}
          {company.industry ? ` · ${company.industry}` : ""} · client since{" "}
          {company.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <nav className="ml-auto flex gap-1 rounded-md border border-gray-200 bg-white p-0.5 text-xs">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/superadmin/company/${company.id}?range=${r.key}`}
              className={`rounded px-2 py-1 font-medium ${r.key === range.key ? "bg-[#0B57D8] text-white" : "text-gray-500 hover:text-gray-900"}`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Client revenue (all methods)", usd(totals.collected), ""],
          ["Card/ACH processed", usd(totals.processed), ""],
          ["Fee revenue", usd(totals.revenue), "text-[#0B57D8]"],
          ["Total cost (est)", usd(Math.round(totals.cost)), ""],
          [
            "Net (est)",
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

      {!platformPricingConfirmed() && (
        <p className="text-xs text-amber-600">
          Costs use ballpark unit pricing until PLATFORM_PRICING_CONFIRMED=1.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 text-right font-medium">Collected (all)</th>
              <th className="px-3 py-2 text-right font-medium">Card/ACH</th>
              <th className="px-3 py-2 text-right font-medium">Fee revenue</th>
              <th className="px-3 py-2 text-right font-medium">Card cost (est)</th>
              <th className="px-3 py-2 text-right font-medium">AI</th>
              <th className="px-3 py-2 text-right font-medium">Email / SMS</th>
              <th className="px-3 py-2 text-right font-medium">Storage</th>
              <th className="px-3 py-2 text-right font-medium">Net (est)</th>
              <th className="px-3 py-2 text-right font-medium">Finix actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-gray-400">
                  No activity recorded in this range yet — metering starts collecting from the
                  moment it deployed.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const cost = r.cardCostCents + r.aiCostCents + r.commsCostCents + r.storageCostCents;
              const net = r.feeCents - cost;
              return (
                <tr key={r.month} className="hover:bg-blue-50/40">
                  <td className="tabular-nums px-3 py-2 font-medium text-gray-900">{r.month}</td>
                  <td className="tabular-nums px-3 py-2 text-right">
                    {usd(r.collectedCents)}
                    <div className="text-xs font-normal text-gray-400">
                      {r.collectedCount} payments
                    </div>
                  </td>
                  <td className="tabular-nums px-3 py-2 text-right">
                    {usd(r.processedCents)}
                    <div className="text-xs font-normal text-gray-400">
                      {r.processedCount} of {r.collectedCount}
                    </div>
                  </td>
                  <td className="tabular-nums px-3 py-2 text-right text-[#0B57D8]">
                    {usd(r.feeCents)}
                  </td>
                  <td className="tabular-nums px-3 py-2 text-right">{usd(r.cardCostCents)}</td>
                  <td className="tabular-nums px-3 py-2 text-right">
                    {usdFine(r.aiCostCents)}
                    <div className="text-xs font-normal text-gray-400">
                      {compact(r.aiTokens)} tok
                    </div>
                  </td>
                  <td className="tabular-nums px-3 py-2 text-right">
                    {usdFine(r.commsCostCents)}
                    <div className="text-xs font-normal text-gray-400">
                      {r.emails} em · {r.sms} sms
                    </div>
                  </td>
                  <td className="tabular-nums px-3 py-2 text-right">
                    {usdFine(r.storageCostCents)}
                  </td>
                  <td
                    className={`tabular-nums px-3 py-2 text-right font-semibold ${net >= 0 ? "text-emerald-600" : "text-red-600"}`}
                  >
                    {usd(Math.round(net))}
                  </td>
                  <td className="tabular-nums px-3 py-2 text-right text-gray-600">
                    {r.finixResidualCents !== undefined ? usd(r.finixResidualCents) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Recent processor payments</h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 text-left text-xs text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Card</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Fee</th>
                  <th className="px-3 py-2 text-right font-medium">Cost (est)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.filter((p) => p.processorRef).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-400">
                      No processor payments in range.
                    </td>
                  </tr>
                )}
                {payments
                  .filter((p) => p.processorRef)
                  .slice(0, 15)
                  .map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 tabular-nums">
                        {p.paidAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">
                        {p.method === "ACH"
                          ? "ACH"
                          : [p.cardBrand, p.cardType].filter(Boolean).join(" ") || "Card"}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right">
                        {usd(Math.round(Number(p.amount) * 100))}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right text-[#0B57D8]">
                        {p.feeCents !== null ? usd(p.feeCents) : "—"}
                      </td>
                      <td className="tabular-nums px-3 py-2 text-right">
                        {p.estCostCents !== null ? usd(p.estCostCents) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <div className="text-xs leading-relaxed text-gray-500">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">Reading this report</h2>
            <p>
              <span className="text-gray-700">Collected</span> is every payment this business
              recorded — cash, check, and card alike — i.e. their complete revenue through
              WorkBench. <span className="text-gray-700">Card/ACH</span> is the slice that ran
              through Streamflaire Payments; only that slice earns us fees.{" "}
              <span className="text-gray-700">Fee revenue</span> is the flat processing fee billed
              to this company at charge time — exact, not estimated.{" "}
              <span className="text-gray-700">Card cost</span> is the interchange + Finix margin
              estimate per transaction; the <span className="text-gray-700">Finix actual</span>{" "}
              column replaces it with the reported residual once that month&apos;s Net Profit CSV
              is{" "}
              <Link href="/superadmin/finix" className="text-[#0B57D8] underline">
                imported
              </Link>
              . AI cost is exact token counts × unit price. Storage
              {latestStorageBytes !== null
                ? ` (currently ${(Number(latestStorageBytes) / 1_048_576).toFixed(1)} MB)`
                : ""}{" "}
              is priced at each month&apos;s latest snapshot.
            </p>
          </div>

          <AccountActions
            companyId={company.id}
            name={company.name}
            slug={company.slug}
            suspendedAt={company.suspendedAt ? company.suspendedAt.toISOString() : null}
            suspendedReason={company.suspendedReason}
            footprint={footprint}
          />
        </div>
      </div>
    </div>
  );
}
