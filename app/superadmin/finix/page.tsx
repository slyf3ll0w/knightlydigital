import { prisma } from "@/lib/db";
import { ImportForm } from "./ImportForm";

export const dynamic = "force-dynamic";

/**
 * Monthly true-up: Finix's Net Profit report is dashboard-download only (no
 * report API), so once a month the CSV gets dropped here and becomes
 * FinixCostSnapshot rows — the authoritative per-merchant cost/margin the
 * profitability table prefers over estimates.
 */
export default async function FinixImportPage() {
  const snapshots = await prisma.finixCostSnapshot.findMany({
    orderBy: [{ month: "desc" }, { finixMerchantId: "asc" }],
    take: 60,
  });
  const companies = await prisma.company.findMany({
    where: { finixMerchantId: { not: null } },
    select: { name: true, finixMerchantId: true },
  });
  const nameBy = new Map(companies.map((c) => [c.finixMerchantId as string, c.name]));
  const usd = (cents: bigint) =>
    (Number(cents) / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-lg font-bold">Finix Net Profit import</h1>
        <p className="mt-1 text-sm text-stone-400">
          Download the monthly <em>Net Profit</em> report from the Finix dashboard (generated
          around the 10th–15th for the prior month) and upload it here. Rows are matched to
          companies by merchant ID; re-uploading a month overwrites it.
        </p>
      </div>

      <ImportForm />

      <div className="overflow-x-auto rounded-lg border border-stone-800">
        <table className="w-full text-sm">
          <thead className="bg-stone-900 text-left text-xs text-stone-400">
            <tr>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2">Merchant</th>
              <th className="px-3 py-2 text-right">Card sales</th>
              <th className="px-3 py-2 text-right">Fees billed</th>
              <th className="px-3 py-2 text-right">Interchange</th>
              <th className="px-3 py-2 text-right">Residual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800/60">
            {snapshots.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-stone-500">
                  Nothing imported yet.
                </td>
              </tr>
            )}
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2 tabular-nums">{s.month}</td>
                <td className="px-3 py-2">
                  {nameBy.get(s.finixMerchantId) ?? (
                    <span className="text-stone-500">{s.finixMerchantId}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(s.cardSaleCents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(s.cardFeesCents)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{usd(s.interchangeFeesCents)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-emerald-400">
                  {usd(s.residualCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
