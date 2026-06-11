import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
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
    <div className="bg-white border border-gray-200 rounded-lg">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-400">
          No paid work in this period yet.
        </p>
      ) : (
        <div className="p-5 space-y-3">
          {rows.slice(0, 8).map((r) => {
            const pct = total > 0 ? Math.round((r.revenue / total) * 100) : 0;
            return (
              <div key={r.key}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-gray-800 truncate">{r.key}</span>
                  <span className="text-gray-900 font-semibold shrink-0 ml-3">
                    {money(r.revenue)}
                    <span className="text-xs text-gray-400 font-normal ml-1.5">{pct}%</span>
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");
  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

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

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insights</h1>
          <p className="text-sm text-gray-500">
            Where your revenue comes from — by source, service, and area.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {ranges.map((r) => (
            <Link
              key={r.value}
              href={`/app/insights?range=${r.value}`}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                (range ?? "90") === r.value
                  ? "bg-gray-900 text-white"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {r.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <p className="text-xs font-medium text-gray-500 mb-1">Collected revenue</p>
        <p className="text-3xl font-bold text-gray-900">{money(totalRevenue)}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {payments.length} {payments.length === 1 ? "payment" : "payments"} in this period
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
