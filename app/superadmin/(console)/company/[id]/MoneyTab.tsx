import Link from "next/link";
import { prisma } from "@/lib/db";
import { usageDay } from "@/lib/usage";
import { platformPricingConfirmed, storageCostCentsPerMonth, usageCostCents } from "@/lib/platform-costs";
import { Card, Chip, SectionTitle, Stat } from "@/components/ds";
import { compact, shortDate, usd, usdFine } from "@/lib/console-format";
import type { CompanyCore } from "./shared";

/**
 * Money: month-by-month revenue vs. cost for this account, the cost mix,
 * and estimate-vs-actual once Finix Net Profit snapshots exist for its
 * merchant. Unchanged in substance from the original report.
 */

const RANGES = [
  { key: "3", months: 3, label: "3 mo" },
  { key: "12", months: 12, label: "12 mo" },
  { key: "all", months: 120, label: "All time" },
] as const;

type MonthRow = {
  month: string;
  collectedCents: number;
  collectedCount: number;
  processedCents: number;
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

export default async function MoneyTab({ company, rangeKey }: { company: CompanyCore; rangeKey?: string }) {
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[1];
  const sinceDate = new Date();
  sinceDate.setMonth(sinceDate.getMonth() - range.months);
  const sinceDay = usageDay(sinceDate);
  const sinceMonth = sinceDay.slice(0, 7);
  const id = company.id;

  const [usage, payments, snapshots] = await Promise.all([
    prisma.companyUsageDaily.findMany({ where: { companyId: id, day: { gte: sinceDay } }, orderBy: { day: "asc" } }),
    prisma.payment.findMany({
      where: { companyId: id, paidAt: { gte: sinceDate } },
      orderBy: { paidAt: "desc" },
      select: { id: true, amount: true, method: true, feeCents: true, estCostCents: true, cardBrand: true, cardType: true, processorRef: true, paidAt: true },
    }),
    company.finixMerchantId
      ? prisma.finixCostSnapshot.findMany({ where: { finixMerchantId: company.finixMerchantId, month: { gte: sinceMonth } } })
      : Promise.resolve([]),
  ]);

  const months = new Map<string, MonthRow>();
  const monthRow = (month: string): MonthRow => {
    let row = months.get(month);
    if (!row) {
      row = { month, collectedCents: 0, collectedCount: 0, processedCents: 0, processedCount: 0, feeCents: 0, cardCostCents: 0, aiCostCents: 0, commsCostCents: 0, storageCostCents: 0, aiTokens: 0, emails: 0, sms: 0 };
      months.set(month, row);
    }
    return row;
  };
  const latestStorageByMonth = new Map<string, number>();
  for (const u of usage) {
    const m = u.day.slice(0, 7);
    const row = monthRow(m);
    row.aiCostCents += usageCostCents({ aiTokensIn: u.aiTokensIn, aiTokensOut: u.aiTokensOut, aiTokensCached: u.aiTokensCached, emailsSent: 0, smsSegments: 0 });
    row.commsCostCents += usageCostCents({ aiTokensIn: 0, aiTokensOut: 0, aiTokensCached: 0, emailsSent: u.emailsSent, smsSegments: u.smsSegments });
    row.aiTokens += u.aiTokensIn + u.aiTokensOut;
    row.emails += u.emailsSent;
    row.sms += u.smsSent;
    if (u.storageBytes !== null) latestStorageByMonth.set(m, Number(u.storageBytes));
  }
  for (const [m, bytes] of latestStorageByMonth) monthRow(m).storageCostCents = storageCostCentsPerMonth(bytes);
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
  for (const s of snapshots) monthRow(s.month).finixResidualCents = Number(s.residualCents);

  const rows = [...months.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
  const totals = rows.reduce(
    (t, r) => ({
      collected: t.collected + r.collectedCents,
      processed: t.processed + r.processedCents,
      revenue: t.revenue + r.feeCents,
      cost: t.cost + r.cardCostCents + r.aiCostCents + r.commsCostCents + r.storageCostCents,
    }),
    { collected: 0, processed: 0, revenue: 0, cost: 0 }
  );
  const net = totals.revenue - totals.cost;
  const processor = payments.filter((p) => p.processorRef).slice(0, 15);
  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex gap-1" aria-label="Range">
          {RANGES.map((r) => (
            <Link key={r.key} prefetch={false} href={`/superadmin/company/${id}?tab=money&range=${r.key}`} className={`ds-btn ds-btn-sm ${r.key === range.key ? "ds-btn-soft" : "ds-btn-ghost"}`} aria-current={r.key === range.key ? "page" : undefined}>
              {r.label}
            </Link>
          ))}
        </nav>
        {!platformPricingConfirmed() && <Chip tone="warn">Estimated pricing</Chip>}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat className="ds-rise" style={rise(1)} label="Client revenue" value={usd(totals.collected)} foot="all payment methods" />
        <Stat className="ds-rise" style={rise(2)} label="Card / ACH" value={usd(totals.processed)} foot="through Streamflaire Payments" />
        <Stat className="ds-rise" style={rise(3)} label="Fee revenue" value={usd(totals.revenue)} foot="ours" />
        <Stat className="ds-rise" style={rise(4)} label="Cost" value={usd(Math.round(totals.cost))} foot="estimated" />
        <Stat className="ds-rise" style={rise(5)} label="Net" value={usd(Math.round(net))} tone={net >= 0 ? "good" : "bad"} foot="estimated" />
      </div>

      <SectionTitle
        className="mt-8"
        info="Collected is every payment this business recorded (cash, check and card alike). Card/ACH is the slice through Streamflaire Payments; only that slice earns fees. Fee revenue is the flat processing fee billed at charge time (exact). Card cost is the interchange + Finix margin estimate per transaction; Finix actual replaces it once that month's Net Profit CSV is imported on Profitability. AI cost is exact token counts × unit price. Storage is priced at each month's latest snapshot."
      >
        By month
      </SectionTitle>
      <Card className="ds-rise overflow-x-auto" style={rise(6)}>
        <table className="w-full min-w-[1000px] text-[13.5px]">
          <thead>
            <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
              <th className="px-4 py-2.5 font-medium">Month</th>
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
                  No activity recorded in this range yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const cost = r.cardCostCents + r.aiCostCents + r.commsCostCents + r.storageCostCents;
              const n = r.feeCents - cost;
              return (
                <tr key={r.month} className="transition-colors hover:bg-[color:var(--ds-surface-2)]">
                  <td className="ds-num px-4 py-2.5 font-medium text-[color:var(--ds-ink)]">{r.month}</td>
                  <td className="ds-num px-3 py-2.5 text-right">
                    {usd(r.collectedCents)}
                    <span className="ds-small block">{r.collectedCount} payments</span>
                  </td>
                  <td className="ds-num px-3 py-2.5 text-right">
                    {usd(r.processedCents)}
                    <span className="ds-small block">
                      {r.processedCount} of {r.collectedCount}
                    </span>
                  </td>
                  <td className="ds-num px-3 py-2.5 text-right text-[color:var(--ds-primary)]">{usd(r.feeCents)}</td>
                  <td className="ds-num px-3 py-2.5 text-right">{usd(r.cardCostCents)}</td>
                  <td className="ds-num px-3 py-2.5 text-right">
                    {usdFine(r.aiCostCents)}
                    <span className="ds-small block">{compact(r.aiTokens)} tok</span>
                  </td>
                  <td className="ds-num px-3 py-2.5 text-right">
                    {usdFine(r.commsCostCents)}
                    <span className="ds-small block">
                      {r.emails} em · {r.sms} sms
                    </span>
                  </td>
                  <td className="ds-num px-3 py-2.5 text-right">{usdFine(r.storageCostCents)}</td>
                  <td className="ds-num px-3 py-2.5 text-right font-semibold" style={{ color: n >= 0 ? "var(--ds-good)" : "var(--ds-bad)" }}>
                    {usd(Math.round(n))}
                  </td>
                  <td className="ds-num px-3 py-2.5 text-right text-[color:var(--ds-ink-2)]">{r.finixResidualCents !== undefined ? usd(r.finixResidualCents) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <SectionTitle className="mt-8">Recent processor payments</SectionTitle>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-[13.5px]">
          <thead>
            <tr className="ds-label border-b border-[color:var(--ds-line)] text-left">
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-3 py-2.5 font-medium">Card</th>
              <th className="px-3 py-2.5 text-right font-medium">Amount</th>
              <th className="px-3 py-2.5 text-right font-medium">Fee</th>
              <th className="px-3 py-2.5 text-right font-medium">Cost (est)</th>
            </tr>
          </thead>
          <tbody className="ds-divide">
            {processor.length === 0 && (
              <tr>
                <td colSpan={5} className="ds-small px-4 py-6 text-center">
                  No processor payments in range.
                </td>
              </tr>
            )}
            {processor.map((p) => (
              <tr key={p.id}>
                <td className="ds-num px-4 py-2.5">{shortDate(p.paidAt)}</td>
                <td className="px-3 py-2.5 text-[color:var(--ds-ink-2)]">{p.method === "ACH" ? "ACH" : [p.cardBrand, p.cardType].filter(Boolean).join(" ") || "Card"}</td>
                <td className="ds-num px-3 py-2.5 text-right">{usd(Math.round(Number(p.amount) * 100))}</td>
                <td className="ds-num px-3 py-2.5 text-right text-[color:var(--ds-primary)]">{p.feeCents !== null ? usd(p.feeCents) : "—"}</td>
                <td className="ds-num px-3 py-2.5 text-right">{p.estCostCents !== null ? usd(p.estCostCents) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
