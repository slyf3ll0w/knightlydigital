import Link from "next/link";
import { Megaphone } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import PageTitle from "@/components/PageTitle";
import BackLink from "@/components/BackLink";
import { FilterRow, FilterChip } from "@/components/FilterChips";
import EmptyState from "@/components/EmptyState";
import { Chip, InfoTip } from "@/components/ds";
import { money } from "@/lib/statuses";
import { loadLeadSourceReport, loadLeadsForSource, REPORT_LEAD_CAP } from "@/lib/lead-source-report";
import { leadSourceKey } from "@/lib/lead-source";

/**
 * Lead sources (2026-11-17): where the leads of a period came from and what
 * became of them — leads, quoted, won, win rate, revenue per source. Tap a
 * source for the leads behind it. Read: lib/lead-source-report.ts; plan and
 * test recipes: docs/plans/lead-sources-2026-11-17.md.
 */

const ranges = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
];

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

export default async function LeadSourcesPage({ searchParams }: { searchParams: Promise<{ range?: string; source?: string }> }) {
  const actor = await requirePageActor((a) => isManager(a.role));
  const companyId = actor.companyId;
  const { range, source } = await searchParams;
  const activeRange = ranges.some((r) => r.value === range) ? (range as string) : "90";
  const since = new Date(Date.now() - parseInt(activeRange) * 86400000);
  const sourceKey = source ? leadSourceKey(source).slice(0, 80) : "";

  const [report, picked, company] = await Promise.all([
    loadLeadSourceReport(companyId, { since }),
    sourceKey ? loadLeadsForSource(companyId, { since }, sourceKey) : Promise.resolve(null),
    prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }),
  ]);
  const timeZone = company?.timezone ?? "America/Chicago";
  const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
  const { rows, totals } = report;
  const top = rows.reduce((m, r) => Math.max(m, r.leads), 0);
  const href = (key?: string) => `/app/insights/lead-sources?range=${activeRange}${key ? `&source=${encodeURIComponent(key)}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-8">
      <div className="mb-3 flex items-start gap-3 lg:mb-5">
        <BackLink href="/app/insights" className="mt-1.5" />
        <PageTitle
          section="business"
          icon={Megaphone}
          info="Leads that came in during this period, grouped by where they came from, with what has become of them since: a quote sent, became a client, money collected. Website leads are filed automatically (an ad click, a search, another site). Untracked means nobody said."
        >
          Lead sources
        </PageTitle>
      </div>

      <FilterRow>
        {ranges.map((r) => (
          <FilterChip key={r.value} hue="var(--ds-primary)" active={activeRange === r.value} href={`/app/insights/lead-sources?range=${r.value}${sourceKey ? `&source=${encodeURIComponent(sourceKey)}` : ""}`}>
            {r.label}
          </FilterChip>
        ))}
      </FilterRow>

      {/* The period at a glance: four numbers, two by two on a phone */}
      <div className="ds-card mb-5 grid grid-cols-2 divide-x divide-y divide-[color:var(--ds-line)] lg:grid-cols-4 lg:divide-y-0" data-testid="lead-source-totals">
        <div className="px-4 py-3 lg:px-5 lg:py-4">
          <p className="numeral-ledger text-2xl font-semibold text-gray-900">{totals.leads}</p>
          <p className="text-xs text-gray-500">Leads</p>
        </div>
        <div className="px-4 py-3 lg:px-5 lg:py-4">
          <p className="numeral-ledger text-2xl font-semibold text-[color:var(--ds-good)]">{totals.won}</p>
          <p className="text-xs text-gray-500">Became clients</p>
        </div>
        <div className="px-4 py-3 lg:px-5 lg:py-4">
          <p className="numeral-ledger text-2xl font-semibold text-gray-900">{pct(totals.winRate)}</p>
          <p className="text-xs text-gray-500">Win rate</p>
        </div>
        <div className="px-4 py-3 lg:px-5 lg:py-4">
          <p className="numeral-ledger text-2xl font-semibold text-gray-900">{money(totals.revenue)}</p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            Collected
            <InfoTip>Everything these leads have paid so far, including after the period ended.</InfoTip>
          </p>
        </div>
      </div>

      {report.capped && <p className="mb-3 text-xs text-gray-500">Showing the newest {REPORT_LEAD_CAP.toLocaleString()} leads of this period.</p>}

      {picked ? (
        <div className="ds-card" data-testid="lead-source-leads">
          <div className="flex items-center justify-between gap-3 border-b border-[color:var(--ds-line)] px-4 py-3.5 lg:px-5 lg:py-4">
            <h2 className="min-w-0 truncate text-sm font-semibold text-[color:var(--ds-ink)]">
              {picked.source || source} · {picked.leads.length} {picked.leads.length === 1 ? "lead" : "leads"}
            </h2>
            <Link href={href()} className="shrink-0 text-xs font-semibold text-[color:var(--ds-primary)] hover:underline">
              All sources
            </Link>
          </div>
          {picked.leads.length === 0 ? (
            <EmptyState compact title="No leads from this source in this period." />
          ) : (
            <div className="divide-y divide-[color:var(--ds-line)]">
              {picked.leads.map((l) => (
                <Link key={l.id} prefetch={false} href={`/app/contacts/${l.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-gray-50 lg:px-5 lg:hover:bg-gray-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-gray-900">{l.name}</span>
                    <span className="block truncate text-xs text-gray-500">
                      {day(l.createdAt)}
                      {l.detail ? ` · ${l.detail}` : ""}
                    </span>
                  </span>
                  {l.won ? <Chip tone="good">Client</Chip> : l.status === "ARCHIVED" ? <Chip>Lost</Chip> : <Chip tone="warn">Lead</Chip>}
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : rows.length === 0 ? (
        <div className="ds-card">
          <EmptyState compact title="No leads came in during this period." />
        </div>
      ) : (
        <>
          {/* Phones: one row per source, the count and outcome under the name */}
          <div className="ds-card divide-y divide-[color:var(--ds-line)] lg:hidden" data-testid="lead-source-rows">
            {rows.map((r) => (
              <Link key={r.key} href={href(r.key)} className="block px-4 py-3 active:bg-gray-50">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{r.source}</span>
                  <span className="numeral-ledger shrink-0 text-sm font-semibold text-gray-900">{money(r.revenue)}</span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  {r.leads} {r.leads === 1 ? "lead" : "leads"} · {r.won} won ({pct(r.winRate)})
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[color:var(--ds-primary)]" style={{ width: `${top > 0 ? Math.round((r.leads / top) * 100) : 0}%` }} />
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: the full table */}
          <div className="ds-card hidden overflow-hidden lg:block" data-testid="lead-source-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--ds-line)] text-left text-xs font-medium text-gray-500">
                  <th className="px-5 py-3 font-medium">Source</th>
                  <th className="px-3 py-3 text-right font-medium">Leads</th>
                  <th className="px-3 py-3 text-right font-medium">Quoted</th>
                  <th className="px-3 py-3 text-right font-medium">Won</th>
                  <th className="px-3 py-3 text-right font-medium">Win rate</th>
                  <th className="px-5 py-3 text-right font-medium">Collected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--ds-line)]">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <Link href={href(r.key)} className="font-medium text-gray-900 hover:underline">
                        {r.source}
                      </Link>
                      <div className="mt-1.5 h-1.5 max-w-xs overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full rounded-full bg-[color:var(--ds-primary)]" style={{ width: `${top > 0 ? Math.round((r.leads / top) * 100) : 0}%` }} />
                      </div>
                    </td>
                    <td className="numeral-ledger px-3 py-3 text-right font-semibold text-gray-900">{r.leads}</td>
                    <td className="numeral-ledger px-3 py-3 text-right text-gray-700">{r.quoted}</td>
                    <td className="numeral-ledger px-3 py-3 text-right text-gray-700">{r.won}</td>
                    <td className="numeral-ledger px-3 py-3 text-right text-gray-700">{pct(r.winRate)}</td>
                    <td className="numeral-ledger px-5 py-3 text-right font-semibold text-gray-900">{money(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
