import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { FilterRow, FilterChip } from "@/components/FilterChips";
import { SECTION_HUES } from "@/lib/section-colors";
import { money } from "@/lib/statuses";

const ranges = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
  { value: "all", label: "All time" },
];

type Bucket = { revenue: number; count: number };

function aggregate(rows: { key: string; amount: number }[]): (Bucket & { key: string })[] {
  const map = new Map<string, Bucket>();
  for (const r of rows) {
    const b = map.get(r.key) ?? { revenue: 0, count: 0 };
    b.revenue += r.amount;
    b.count += 1;
    map.set(r.key, b);
  }
  return [...map.entries()]
    .map(([key, b]) => ({ key, ...b }))
    .sort((a, b) => b.revenue - a.revenue);
}

function BreakdownCard({
  title,
  subtitle,
  rows,
  total,
}: {
  title: string;
  subtitle: string;
  rows: (Bucket & { key: string })[];
  total: number;
}) {
  return (
    <div className="card-ledger">
      <div className="border-b border-gray-100 px-4 py-3.5 lg:px-5 lg:py-4">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-gray-400 lg:py-10">
          No paid work in this period yet.
        </p>
      ) : (
        <div className="space-y-3.5 p-4 lg:space-y-3 lg:p-5">
          {rows.slice(0, 8).map((r) => {
            const pct = total > 0 ? Math.round((r.revenue / total) * 100) : 0;
            return (
              <div key={r.key}>
                {/* Name over the bar, money on the right — at phone widths a
                    single row squeezed long service names to three letters */}
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-medium text-gray-800">{r.key}</span>
                  <span className="numeral-ledger shrink-0 font-semibold text-gray-900">
                    {money(r.revenue)}
                    <span className="ml-1.5 text-xs font-normal text-gray-400">{pct}%</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 lg:h-2">
                  <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** One line of the phone P&L card: label left, money right. */
function LedgerLine({
  label,
  value,
  hint,
  href,
  strong,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  strong?: boolean;
  tone?: "positive" | "negative";
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate ${
            strong ? "text-[15px] font-semibold text-gray-900" : "text-sm text-gray-600"
          }`}
        >
          {label}
        </span>
        {hint && <span className="block truncate text-[11px] text-gray-400">{hint}</span>}
      </span>
      <span
        className={`numeral-ledger shrink-0 tabular-nums ${
          strong ? "text-xl font-bold" : "text-[15px] font-semibold"
        } ${
          tone === "negative"
            ? "text-red-600"
            : tone === "positive"
              ? "text-green-700"
              : "text-gray-900"
        }`}
      >
        {value}
      </span>
    </>
  );
  const cls = `flex items-center gap-3 px-4 py-3 ${href ? "active:bg-gray-50 transition-colors" : ""}`;
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;

  const { range } = await searchParams;
  const days = range === "all" ? null : parseInt(range ?? "90") || 90;
  const since = days ? new Date(Date.now() - days * 86400000) : undefined;

  // Revenue = recorded payments, attributed via the invoice's job and contact
  const payments = await prisma.payment.findMany({
    where: { companyId, ...(since ? { paidAt: { gte: since } } : {}) },
    include: {
      invoice: {
        include: {
          job: true,
          contact: true,
          lineItems: true,
        },
      },
    },
  });

  const totalRevenue = payments.reduce((s, p) => s + Number(p.amount), 0);

  // By lead source (job's source, falling back to the client's)
  const bySource = aggregate(
    payments.map((p) => ({
      key: p.invoice.job?.leadSource || p.invoice.contact?.leadSource || "Untracked",
      amount: Number(p.amount),
    }))
  );

  // By area (client city, else job address)
  const byArea = aggregate(
    payments.map((p) => ({
      key: p.invoice.contact?.city || p.invoice.job?.address || "Unknown area",
      amount: Number(p.amount),
    }))
  );

  // By service: split each payment across its invoice's line items proportionally
  const serviceRows: { key: string; amount: number }[] = [];
  for (const p of payments) {
    const items = p.invoice.lineItems;
    const invoiceTotal = items.reduce((s, li) => s + Number(li.total), 0);
    if (invoiceTotal <= 0) {
      serviceRows.push({ key: "Unspecified service", amount: Number(p.amount) });
      continue;
    }
    for (const li of items) {
      serviceRows.push({
        key: li.name || li.description || "Unspecified service",
        amount: Number(p.amount) * (Number(li.total) / invoiceTotal),
      });
    }
  }
  const byService = aggregate(serviceRows);

  // Profit = collected revenue − logged business expenses for the same range
  const expenseAgg = await prisma.expense.aggregate({
    where: { companyId, ...(since ? { incurredAt: { gte: since } } : {}) },
    _sum: { amount: true },
    _count: true,
  });
  const totalExpenses = Number(expenseAgg._sum.amount) || 0;
  const profit = totalRevenue - totalExpenses;

  // Lead pipeline funnel: what's on the board now + wins/losses in the range
  const [stages, boardCounts, wonCount, lostCount] = await Promise.all([
    prisma.pipelineStage.findMany({
      where: { companyId, isConverted: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.contact.groupBy({
      by: ["pipelineStageId"],
      where: { companyId, pipelineStage: { isConverted: false } },
      _count: true,
    }),
    prisma.contact.count({
      where: { companyId, ...(since ? { wonAt: { gte: since } } : { wonAt: { not: null } }) },
    }),
    prisma.contact.count({
      where: { companyId, ...(since ? { lostAt: { gte: since } } : { lostAt: { not: null } }) },
    }),
  ]);
  const countByStage = new Map(boardCounts.map((b) => [b.pipelineStageId, b._count]));
  const onBoard = boardCounts.reduce((s, b) => s + b._count, 0);
  const winRate =
    wonCount + lostCount > 0 ? Math.round((wonCount / (wonCount + lostCount)) * 100) : null;

  const activeRange = range ?? "90";
  const paymentCount = `${payments.length} ${payments.length === 1 ? "payment" : "payments"}`;

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <PageTitle section="business" icon={BarChart3}>
        Insights
      </PageTitle>
      <p className="mb-3 mt-1.5 text-sm text-gray-500 lg:mb-5">
        Where your revenue comes from — by source, service, and area.
      </p>

      {/* Range picker — a scrolling chip rail on phones (four buttons in one
          flex row used to squeeze into unreadable slivers), the same control
          every list page uses for its filters. */}
      <FilterRow>
        {ranges.map((r) => (
          <FilterChip
            key={r.value}
            hue={SECTION_HUES.business}
            active={activeRange === r.value}
            href={`/app/insights?range=${r.value}`}
          >
            {r.label}
          </FilterChip>
        ))}
      </FilterRow>

      {/* Money summary. Phones get one card that reads like a mini P&L —
          revenue, expenses, and the profit line underneath — because three
          side-by-side $ figures don't fit at 375px. Desktop keeps the cards. */}
      <div className="card-tool mb-5 divide-y divide-gray-100 lg:hidden">
        <LedgerLine
          label="Collected revenue"
          hint={`${paymentCount} in this period`}
          value={money(totalRevenue)}
        />
        <LedgerLine
          label="Expenses"
          hint={
            expenseAgg._count > 0
              ? `${expenseAgg._count} logged — manage`
              : "Log expenses to track profit"
          }
          href="/app/expenses"
          value={totalExpenses > 0 ? `−${money(totalExpenses)}` : money(0)}
        />
        <LedgerLine
          label="Profit"
          value={money(profit)}
          strong
          tone={profit >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="mb-6 hidden gap-4 lg:grid lg:grid-cols-3">
        <div className="card-ledger p-5">
          <p className="mb-1 text-xs font-medium text-gray-500">Collected revenue</p>
          <p className="numeral-ledger text-3xl font-bold text-gray-900">{money(totalRevenue)}</p>
          <p className="mt-0.5 text-xs text-gray-500">{paymentCount} in this period</p>
        </div>
        <div className="card-ledger p-5">
          <p className="mb-1 text-xs font-medium text-gray-500">Expenses</p>
          <p className="numeral-ledger text-3xl font-bold text-gray-900">{money(totalExpenses)}</p>
          <Link href="/app/expenses" className="mt-0.5 inline-block text-xs text-green-600 hover:underline">
            {expenseAgg._count > 0
              ? `${expenseAgg._count} logged — manage →`
              : "Log expenses to track profit →"}
          </Link>
        </div>
        <div className="card-ledger p-5">
          <p className="mb-1 text-xs font-medium text-gray-500">Profit</p>
          <p
            className={`numeral-ledger text-3xl font-bold ${
              profit >= 0 ? "text-green-700" : "text-red-600"
            }`}
          >
            {money(profit)}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">revenue minus expenses</p>
        </div>
      </div>

      {/* Lead pipeline funnel — stages scroll edge-to-edge on phones (a
          wrapping flex row left orphaned columns and a stray divider), and
          the won/lost/rate outcomes sit in their own fixed 3-up row. */}
      <div className="card-ledger mb-5 lg:mb-6">
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3.5 lg:px-5 lg:py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">Lead pipeline</h2>
            {/* The won/lost caveat used to live here and wrapped to two lines
                on phones — the outcome cells below carry their own labels. */}
            <p className="text-xs text-gray-500">{onBoard} on the board now</p>
          </div>
          <Link
            href="/app/leads"
            className="shrink-0 text-xs font-semibold text-green-600 hover:underline"
          >
            Open board →
          </Link>
        </div>
        {stages.length > 0 && (
          <div className="no-scrollbar flex gap-4 overflow-x-auto px-4 py-3.5 lg:flex-wrap lg:gap-3 lg:overflow-visible lg:px-5 lg:py-4">
            {stages.map((s) => (
              <div key={s.id} className="w-[84px] shrink-0 lg:min-w-[110px] lg:flex-1">
                <p className="numeral-ledger text-2xl font-semibold text-gray-900">
                  {countByStage.get(s.id) ?? 0}
                </p>
                <p className="truncate text-xs text-gray-500">{s.name}</p>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-t border-gray-100">
          <div className="px-4 py-3 lg:px-5">
            <p className="numeral-ledger text-2xl font-semibold text-green-700">{wonCount}</p>
            <p className="text-xs text-gray-500">Won</p>
          </div>
          <div className="px-4 py-3 lg:px-5">
            <p className="numeral-ledger text-2xl font-semibold text-gray-500">{lostCount}</p>
            <p className="text-xs text-gray-500">Lost</p>
          </div>
          <div className="px-4 py-3 lg:px-5">
            <p className="numeral-ledger text-2xl font-semibold text-gray-900">
              {winRate === null ? "—" : `${winRate}%`}
            </p>
            <p className="text-xs text-gray-500">Win rate</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <BreakdownCard
          title="By lead source"
          subtitle="Set the lead source on jobs and clients to track this"
          rows={bySource}
          total={totalRevenue}
        />
        <BreakdownCard
          title="By service"
          subtitle="From invoice line items"
          rows={byService}
          total={totalRevenue}
        />
        <BreakdownCard
          title="By area"
          subtitle="From client city"
          rows={byArea}
          total={totalRevenue}
        />
      </div>
    </div>
  );
}
