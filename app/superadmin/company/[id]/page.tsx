import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { usageDay } from "@/lib/usage";
import {
  platformPricingConfirmed,
  storageCostCentsPerMonth,
  usageCostCents,
} from "@/lib/platform-costs";

export const dynamic = "force-dynamic";

/**
 * Per-client profitability report: month-by-month revenue vs. cost for one
 * company, the cost mix, and estimate-vs-actual once Finix Net Profit
 * snapshots exist for its merchant. Same sources as the overview table —
 * this is the "how much is THIS client making me" page.
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
  volumeCents: number;
  paymentCount: number;
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
    select: { id: true, name: true, slug: true, createdAt: true, finixMerchantId: true, industry: true },
  });
  if (!company) notFound();

  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - range.months);
  const sinceDay = usageDay(sinceDate);
  const sinceMonth = sinceDay.slice(0, 7);

  const [usage, payments, snapshots] = await Promise.all([
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
  ]);

  // ── Month-by-month rollup ──────────────────────────────────────────────────
  const months = new Map<string, MonthRow>();
  const monthRow = (month: string): MonthRow => {
    let row = months.get(month);
    if (!row) {
      row = {
        month,
        volumeCents: 0,
        paymentCount: 0,
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
    row.volumeCents += Math.round(Number(p.amount) * 100);
    row.paymentCount += 1;
    row.feeCents += p.feeCents ?? 0;
    row.cardCostCents += p.estCostCents ?? 0;
  }
  for (const s of snapshots) {
    monthRow(s.month).finixResidualCents = Number(s.residualCents);
  }

  const rows = [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  const totals = rows.reduce(
    (t, r) => {
      const cost = r.cardCostCents + r.aiCostCents + r.commsCostCents + r.storageCostCents;
      return {
        volume: t.volume + r.volumeCents,
        revenue: t.revenue + r.feeCents,
        cost: t.cost + cost,
        payments: t.payments + r.paymentCount,
      };
    },
    { volume: 0, revenue: 0, cost: 0, payments: 0 }
  );
  const latestStorageBytes =
    [...usage].reverse().find((u) => u.storageBytes !== null)?.storageBytes ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/superadmin" className="text-sm text-stone-400 hover:text-white">
          ← All companies
        </Link>
        <h1 className="text-lg font-bold text-white">{company.name}</h1>
        <span className="text-xs text-stone-500">
          /{company.slug}
          {company.industry ? ` · ${company.industry}` : ""} · client since{" "}
          {company.createdAt.toLocaleDateString("en-US", { month: "short", year: "numeric" })}
        </span>
        <nav className="ml-auto flex gap-1 rounded-md border border-stone-800 p-0.5 text-xs">
          {RANGES.map((r) => (
            <Link
              key={r.key}
              href={`/superadmin/company/${company.id}?range=${r.key}`}
              className={`rounded px-2 py-1 ${r.key === range.key ? "bg-stone-700 text-white" : "text-stone-400 hover:text-white"}`}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ["Processing volume", usd(totals.volume)],
          ["Payments", String(totals.payments)],
          ["Fee revenue", usd(totals.revenue)],
          ["Total cost (est)", usd(Math.round(totals.cost))],
          ["Net (est)", usd(Math.round(totals.revenue - totals.cost))],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-stone-800 bg-stone-900 p-3">
            <div className="text-xs text-stone-400">{label}</div>
            <div
              className={`mt-1 text-xl font-bold tabular-nums ${
                label === "Net (est)"
                  ? totals.revenue - totals.cost >= 0
                    ? "text-emerald-400"
                    : "text-red-400"
                  : ""
              }`}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {!platformPricingConfirmed() && (
        <p className="text-xs text-amber-400">
          Costs use ballpark unit pricing until PLATFORM_PRICING_CONFIRMED=1.
        </p>
      )}

      <div className="overflow-x-auto rounded-lg border border-stone-800">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-stone-900 text-left text-xs text-stone-400">
            <tr>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2 text-right">Volume</th>
              <th className="px-3 py-2 text-right">Fee revenue</th>
              <th className="px-3 py-2 text-right">Card cost (est)</th>
              <th className="px-3 py-2 text-right">AI</th>
              <th className="px-3 py-2 text-right">Email / SMS</th>
              <th className="px-3 py-2 text-right">Storage</th>
              <th className="px-3 py-2 text-right">Net (est)</th>
              <th className="px-3 py-2 text-right">Finix actual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800/60">
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-stone-500">
                  No activity recorded in this range yet — metering starts collecting from the
                  moment it deployed.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const cost = r.cardCostCents + r.aiCostCents + r.commsCostCents + r.storageCostCents;
              const net = r.feeCents - cost;
              return (
                <tr key={r.month} className="hover:bg-stone-900/50">
                  <td className="px-3 py-2 font-medium tabular-nums text-white">{r.month}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {usd(r.volumeCents)}
                    <div className="text-xs text-stone-500">{r.paymentCount} payments</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                    {usd(r.feeCents)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{usd(r.cardCostCents)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {usdFine(r.aiCostCents)}
                    <div className="text-xs text-stone-500">{compact(r.aiTokens)} tok</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {usdFine(r.commsCostCents)}
                    <div className="text-xs text-stone-500">
                      {r.emails} em · {r.sms} sms
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {usdFine(r.storageCostCents)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold tabular-nums ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {usd(Math.round(net))}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-stone-300">
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
          <h2 className="mb-2 text-sm font-semibold text-stone-300">Recent processor payments</h2>
          <div className="overflow-x-auto rounded-lg border border-stone-800">
            <table className="w-full text-sm">
              <thead className="bg-stone-900 text-left text-xs text-stone-400">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Card</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-right">Fee</th>
                  <th className="px-3 py-2 text-right">Cost (est)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-800/60">
                {payments.filter((p) => p.processorRef).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-stone-500">
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
                      <td className="px-3 py-2 text-xs text-stone-400">
                        {p.method === "ACH"
                          ? "ACH"
                          : [p.cardBrand, p.cardType].filter(Boolean).join(" ") || "Card"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {usd(Math.round(Number(p.amount) * 100))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-400">
                        {p.feeCents !== null ? usd(p.feeCents) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {p.estCostCents !== null ? usd(p.estCostCents) : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="text-xs leading-relaxed text-stone-500">
          <h2 className="mb-2 text-sm font-semibold text-stone-300">Reading this report</h2>
          <p>
            <span className="text-stone-300">Fee revenue</span> is the flat processing fee billed
            to this company at charge time — exact, not estimated.{" "}
            <span className="text-stone-300">Card cost</span> is the interchange + Finix margin
            estimate per transaction; the <span className="text-stone-300">Finix actual</span>{" "}
            column replaces it with the reported residual once that month&apos;s Net Profit CSV is{" "}
            <Link href="/superadmin/finix" className="text-stone-300 underline">
              imported
            </Link>
            . AI cost is exact token counts × unit price. Storage
            {latestStorageBytes !== null
              ? ` (currently ${(Number(latestStorageBytes) / 1_048_576).toFixed(1)} MB)`
              : ""}{" "}
            is priced at each month&apos;s latest snapshot.
          </p>
        </div>
      </div>
    </div>
  );
}
