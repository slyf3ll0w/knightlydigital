import { Download } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { listHref } from "@/components/FilterBar";
import { FilterChip, Segment, SegmentedRow } from "@/components/FilterChips";
import { money } from "@/lib/statuses";
import type { PaymentsReport, ReportPeriod, ReportTotals } from "@/lib/payments-reports";
import type { SellerReadFailure } from "@/lib/square-seller-reports";
import { RuledLabel, SquareUnavailable } from "./bits";

/**
 * Reports tab: money in for the last 12 days / weeks / months in the
 * company's zone — collected, refunds, fees, net — then by tech and by job
 * type (the two the Square dashboard cannot do), with a CSV download. Pure
 * math in lib/payments-reports; rows from PaymentsTab's loader.
 */
export default function ReportsTab({
  report,
  squareFailure,
  squareTruncated,
}: {
  report: PaymentsReport;
  squareFailure: SellerReadFailure | null;
  squareTruncated: boolean;
}) {
  const periodWord: Record<ReportPeriod, string> = { day: "Day", week: "Week", month: "Month" };
  const options: { value: ReportPeriod; label: string }[] = [
    { value: "day", label: "By day" },
    { value: "week", label: "By week" },
    { value: "month", label: "By month" },
  ];
  const href = (p: ReportPeriod) => listHref("/app/payments", { tab: "reports" }, { period: p === "month" ? undefined : p });
  const csvHref = `/api/app/payments/reports?period=${report.period}&format=csv`;
  const t = report.totals;
  const any = t.count > 0;

  const Totals = ({ x, bold = false }: { x: ReportTotals; bold?: boolean }) => (
    <>
      <span className={`numeral-ledger hidden lg:block text-sm text-right ${bold ? "font-semibold text-gray-700" : "text-gray-600"}`}>{x.count ? Math.round(x.count) : ""}</span>
      <span className={`numeral-ledger text-sm text-right ${bold ? "font-semibold text-gray-700" : "text-gray-600"}`}>{money(x.collectedCents / 100)}</span>
      <span className={`numeral-ledger hidden lg:block text-sm text-right ${bold ? "font-semibold" : ""} ${x.refundsCents ? "text-[color:var(--ds-warn)]" : "text-gray-400"}`}>
        {x.refundsCents ? money(x.refundsCents / 100) : "—"}
      </span>
      <span className={`numeral-ledger hidden lg:block text-sm text-right ${bold ? "font-semibold text-gray-700" : "text-gray-600"}`}>{x.feesCents ? money(x.feesCents / 100) : "—"}</span>
      <span className={`numeral-ledger text-sm text-right font-semibold ${x.netCents < 0 ? "text-[color:var(--ds-bad)]" : "text-[color:var(--ds-ink)]"}`}>{money(x.netCents / 100)}</span>
    </>
  );
  const grid = "lg:grid-cols-[1fr_70px_120px_110px_110px_120px]";
  const Head = ({ first }: { first: string }) => (
    <div className={`hidden lg:grid ${grid} gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50`}>
      <span>{first}</span>
      <span className="text-right">#</span>
      <span className="text-right">Collected</span>
      <span className="text-right">Refunds</span>
      <span className="text-right">Fees</span>
      <span className="text-right">Net</span>
    </div>
  );
  const Foot = ({ label }: { label: string }) => (
    <div className={`flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid ${grid}`}>
      <span className="text-xs font-medium text-gray-500">{label}</span>
      <Totals x={t} bold />
    </div>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="lg:hidden w-full">
          <SegmentedRow>
            {options.map((o) => (
              <Segment key={o.value} active={o.value === report.period} href={href(o.value)}>
                {o.label}
              </Segment>
            ))}
          </SegmentedRow>
        </div>
        <div className="hidden lg:flex items-center gap-2">
          {options.map((o) => (
            <FilterChip key={o.value} hue="var(--ds-primary)" active={o.value === report.period} href={href(o.value)}>
              {o.label}
            </FilterChip>
          ))}
        </div>
        <a href={csvHref} className="ds-btn ds-btn-outline ds-btn-sm" title="Download this report as CSV">
          <Download size={14} />
          Download CSV
        </a>
      </div>

      <div className="mb-8">
        <RuledLabel
          info={
            <>
              Every payment recorded in WorkBench (card, bank, cash, check) plus sales your Square account took outside
              WorkBench, by the day it was paid in your timezone. Collected is the full charge; refunds what went back;
              fees what Square kept (Square&apos;s posted fee when it has one, otherwise the published rate); net is
              collected minus refunds minus fees. Weeks start on Sunday.
            </>
          }
        >
          Money in · last 12 {report.period === "day" ? "days" : report.period === "week" ? "weeks" : "months"}
        </RuledLabel>
        {squareFailure && <SquareUnavailable failure={squareFailure} what="Square's own sales" />}
        {squareTruncated && <p className="mb-3 text-xs text-gray-500">Square listed more sales than this report walked; the most recent 500 are counted.</p>}
        <div className="ds-card overflow-hidden">
          {!any ? (
            <EmptyState compact title="Nothing collected in this range" body="Payments show here by the day they were paid." />
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                <Head first={periodWord[report.period]} />
                {[...report.periods].reverse().map((p) => (
                  <div key={p.key} className={`flex items-center justify-between gap-4 px-4 py-2.5 lg:grid ${grid} ${p.count === 0 ? "opacity-60" : ""}`}>
                    <span className="text-sm font-medium text-gray-900">{p.label}</span>
                    <Totals x={p} />
                  </div>
                ))}
              </div>
              <Foot label="Total" />
            </>
          )}
        </div>
      </div>

      {any && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <RuledLabel info="Who was on the job the invoice billed. A payment on a job with several people is split evenly between them so the column adds up; Unassigned is money with no job or nobody assigned.">
              By tech
            </RuledLabel>
            <div className="ds-card overflow-hidden">
              <div className="divide-y divide-gray-100">
                {report.byTech.map((b) => (
                  <div key={b.name} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{b.name}</span>
                    <span className="numeral-ledger text-sm text-gray-600 text-right">{money(b.collectedCents / 100)}</span>
                    <span className="numeral-ledger w-24 text-sm font-semibold text-right text-[color:var(--ds-ink)]">{money(b.netCents / 100)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2 text-xs font-medium text-gray-500">
                <span>Collected · net</span>
              </div>
            </div>
          </div>
          <div>
            <RuledLabel info="The kind of work: the price-book services on the job (or its title). No job is money on invoices that weren't tied to a job, plus Square sales taken outside WorkBench.">
              By job type
            </RuledLabel>
            <div className="ds-card overflow-hidden">
              <div className="divide-y divide-gray-100">
                {report.byJobType.map((b) => (
                  <div key={b.name} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{b.name}</span>
                    <span className="numeral-ledger text-sm text-gray-600 text-right">{money(b.collectedCents / 100)}</span>
                    <span className="numeral-ledger w-24 text-sm font-semibold text-right text-[color:var(--ds-ink)]">{money(b.netCents / 100)}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2 text-xs font-medium text-gray-500">
                <span>Collected · net</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
