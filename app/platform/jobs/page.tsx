import { prisma } from "@/lib/db";
import { dealLine } from "@/lib/empty-lines";
import { headerNote } from "@/lib/header-notes";
import { requirePageActor, jobScope, canSeePricing, canSeeMoney, isManager } from "@/lib/permissions";
import EntityRowActions from "@/components/EntityRowActions";
import Link from "next/link";
import { Plus, ChevronRight, Download, Search } from "lucide-react";
import { BandBody, Button, DsPage, PageHeader } from "@/components/ds";
import FilterSelect from "@/components/FilterSelect";
import { money, shortDate } from "@/lib/statuses";
import { fmtTime } from "@/lib/format";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import { WeekBand } from "@/components/ListBands";
import { startOfWeekIn, zonedParts } from "@/lib/timezone";
import { listHref } from "@/components/FilterBar";
import { pickSort, JOB_SORTS, jobOrderBy } from "@/lib/list-sort";
import Pager from "@/components/Pager";
import type { JobStatus } from "@prisma/client";
import PdfLink from "@/components/PdfLink";


const PAGE_SIZE = 100;

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; unscheduled?: string; q?: string; page?: string; sort?: string }>;
}) {
  const actor = await requirePageActor();
  // One true line from this company's numbers, dealt per visit (lib/header-notes.ts)
  const pageNote = await headerNote("jobs", actor);
  const companyId = actor.companyId;
  const scope = jobScope(actor);
  const showMoney = canSeePricing(actor.role);
  const canCreate = isManager(actor.role) || actor.role === "USER";
  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  const { status, unscheduled, q, page: pageParam, sort: sortRaw } = await searchParams;
  const sort = pickSort(sortRaw, JOB_SORTS);
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const validStatus = ["ACTIVE", "REQUIRES_INVOICING", "ARCHIVED"].includes(status ?? "")
    ? (status as JobStatus)
    : undefined;
  const query = q?.trim() || undefined;
  const search = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          { address: { contains: query, mode: "insensitive" as const } },
          {
            contact: {
              OR: [
                { firstName: { contains: query, mode: "insensitive" as const } },
                { lastName: { contains: query, mode: "insensitive" as const } },
              ],
            },
          },
        ],
      }
    : {};

  const listWhere = {
    companyId,
    ...scope,
    ...(validStatus ? { status: validStatus } : {}),
    ...(unscheduled ? { scheduledAt: null } : {}),
    ...search,
  };
  // This week (Sun–Sat, company zone) for the band's strip
  const weekStart = startOfWeekIn(tz, new Date());
  const weekEnd = new Date(weekStart.getTime() + 8 * 86400000);
  const [jobs, listCount, activeCount, requiresInvoicingCount, unscheduledCount, weekJobs, allCount, closedCount] = await Promise.all([
    prisma.job.findMany({
      where: listWhere,
      include: { contact: true, lineItems: true, invoice: { select: { id: true } } },
      orderBy: jobOrderBy(sort),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.job.count({ where: listWhere }),
    prisma.job.count({ where: { companyId, ...scope, status: "ACTIVE" } }),
    prisma.job.count({ where: { companyId, ...scope, status: "REQUIRES_INVOICING" } }),
    prisma.job.count({ where: { companyId, ...scope, status: "ACTIVE", scheduledAt: null } }),
    prisma.job.findMany({
      where: { companyId, ...scope, status: { not: "ARCHIVED" }, scheduledAt: { gte: weekStart, lt: weekEnd } },
      select: { scheduledAt: true },
    }),
    // Desktop tab counts (the list's scope, without the search)
    prisma.job.count({ where: { companyId, ...scope } }),
    prisma.job.count({ where: { companyId, ...scope, status: "ARCHIVED" } }),
  ]);
  const ymd = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz });
  const todayKey = ymd(new Date());
  const perDay = new Map<string, number>();
  for (const j of weekJobs) if (j.scheduledAt) perDay.set(ymd(j.scheduledAt), (perDay.get(ymd(j.scheduledAt)) ?? 0) + 1);
  const week = Array.from({ length: 7 }, (_, i) => {
    // noon of each day keeps DST edges from slipping a date
    const at = new Date(weekStart.getTime() + i * 86400000 + 12 * 3600000);
    const key = ymd(at);
    const p = zonedParts(tz, at);
    return {
      key,
      dow: at.toLocaleDateString("en-US", { weekday: "short", timeZone: tz }),
      date: p.d,
      count: perDay.get(key) ?? 0,
      today: key === todayKey,
      past: key < todayKey,
      href: `/app/schedule?view=day&date=${key}`,
    };
  });


  const pageTotal = jobs.reduce(
    (s, j) => s + j.lineItems.reduce((t, li) => t + Number(li.total), 0),
    0
  );

  // ── Desktop: the open page (2026-11-24) — the page's own header with a
  // context line, the week strip kept from the pilot, a filter row (search,
  // the statuses as underline tabs with counts, sort), then hairline rows that
  // keep the status-colored underline on hover (.ds-trow). Phones (2026-11-25):
  // the same page, each row folded to two lines (app/ds-open-jobs.css).
  const cur = { q: query, sort: sortRaw };
  const tabs = [
    { key: "", label: "All", n: allCount, href: listHref("/app/jobs", cur, {}) },
    { key: "ACTIVE", label: "Active", n: activeCount, href: listHref("/app/jobs", cur, { status: "ACTIVE" }) },
    { key: "REQUIRES_INVOICING", label: "To invoice", n: requiresInvoicingCount, href: listHref("/app/jobs", cur, { status: "REQUIRES_INVOICING" }) },
    { key: "unscheduled", label: "Unscheduled", n: unscheduledCount, href: listHref("/app/jobs", cur, { status: "ACTIVE", unscheduled: "1" }) },
    { key: "ARCHIVED", label: "Closed", n: closedCount, href: listHref("/app/jobs", cur, { status: "ARCHIVED" }) },
  ];
  const tabOn = unscheduled ? "unscheduled" : (validStatus ?? "");
  const eyebrow = [
    `${activeCount.toLocaleString("en-US")} active`,
    requiresInvoicingCount > 0 ? `${requiresInvoicingCount} to invoice` : null,
    unscheduledCount > 0 ? `${unscheduledCount} not scheduled` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const cols = `minmax(0,1fr) 72px 190px 150px ${showMoney ? "110px " : ""}28px`;
  const desktop = (
    <DsPage
      open
      header={
        <PageHeader
          note={pageNote}
          eyebrow={eyebrow}
          title="Jobs"
          actions={
            <>
              <PdfLink
                href="/api/app/export/jobs"
                title="Download all jobs as CSV"
                className="ds-btn ds-btn-outline jbx-desk"
                mime="text/csv"
                newTab={false}
                fallbackName="export.csv"
              >
                <Download size={17} />
                Export
              </PdfLink>
              {canCreate && (
                <Button href="/app/jobs/new" icon={Plus}>
                  New job
                </Button>
              )}
            </>
          }
        />
      }
    >
      <BandBody>
        <div className="jbx-week">
          <WeekBand
            days={week}
            active={{ count: activeCount, href: "/app/jobs?status=ACTIVE" }}
            toInvoice={{ count: requiresInvoicingCount, href: "/app/jobs?status=REQUIRES_INVOICING" }}
            unscheduled={{ count: unscheduledCount, href: "/app/jobs?status=ACTIVE&unscheduled=1" }}
          />
        </div>
        <section className="jbx">
          <div className="clx-filters">
            <form action="/app/jobs" className="clx-search" role="search">
              <Search size={15} aria-hidden />
              <input type="search" name="q" defaultValue={query} placeholder="Search jobs, clients, addresses" aria-label="Search jobs" />
              {validStatus && <input type="hidden" name="status" value={validStatus} />}
              {unscheduled && <input type="hidden" name="unscheduled" value={unscheduled} />}
              {sortRaw && <input type="hidden" name="sort" value={sortRaw} />}
            </form>
            <nav className="clx-tabs" aria-label="Show">
              {tabs.map((t) => (
                <Link
                  key={t.key || "all"}
                  prefetch={false}
                  href={t.href}
                  aria-current={tabOn === t.key ? "page" : undefined}
                  className={`clx-tab ${tabOn === t.key ? "is-on" : ""}`}
                >
                  {t.label}
                  <span className="clx-tab-n">{t.n.toLocaleString("en-US")}</span>
                </Link>
              ))}
            </nav>
            <span className="clx-filters-end">
              <FilterSelect
                icon="sort"
                value={sort}
                options={JOB_SORTS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  href: listHref("/app/jobs", { status: validStatus, unscheduled, q: query }, { sort: o.value }),
                }))}
                align="right"
              />
            </span>
          </div>

          {jobs.length === 0 ? (
            <div className="clx-empty">
              <EmptyState
                art="jobs"
                hue="var(--ds-primary)"
                title={validStatus || unscheduled || query ? "No jobs match this filter" : "No jobs yet"}
                body={
                  validStatus || unscheduled || query
                    ? dealLine("no-match", { thing: "jobs", one: "job" })
                    : "Track work from first visit to final payment — create your first job to get going."
                }
                actionHref="/app/jobs/new"
                actionLabel="Create a job"
              />
            </div>
          ) : (
            <div className="jbx-table" style={{ "--jbx-cols": cols } as React.CSSProperties}>
              <div className="jbx-head" role="presentation">
                <span>Client and job</span>
                <span>#</span>
                <span>Scheduled</span>
                <span>Status</span>
                {showMoney && <span className="r">Total</span>}
                <span />
              </div>
              {jobs.map((j) => {
                const total = j.lineItems.reduce((s, li) => s + Number(li.total), 0);
                const when = j.scheduledAt
                  ? j.scheduledAnytime
                    ? `${shortDate(j.scheduledAt, tz)} · Anytime`
                    : `${shortDate(j.scheduledAt, tz)} · ${fmtTime(j.scheduledAt, tz)}`
                  : null;
                const name = `${j.contact.firstName} ${j.contact.lastName}`.trim();
                return (
                  <EntityRowActions
                    key={j.id}
                    meta={{
                      kind: "job",
                      id: j.id,
                      title: j.title,
                      status: j.status,
                      hasInvoice: Boolean(j.invoice),
                      scheduledAt: j.scheduledAt ? j.scheduledAt.toISOString() : null,
                      canEdit: canCreate,
                      canInvoice: canSeeMoney(actor),
                      canDelete: isManager(actor.role),
                    }}
                  >
                    <Link prefetch={false} href={`/app/jobs/${j.id}`} className="ds-trow jbx-row">
                      <span className="clx-name">
                        <span className="clx-mono" aria-hidden>
                          {(j.contact.firstName?.[0] ?? "") + (j.contact.lastName?.[0] ?? "") || "J"}
                        </span>
                        <span className="min-w-0">
                          <span className="ds-trow-name clx-name-t">{name || "Client"}</span>
                          <span className="clx-name-s jbx-desk">{j.title}</span>
                          {/* Phone sub line: what and when */}
                          <span className="clx-name-s jbx-ph">{j.title} · {when ?? "Unscheduled"}</span>
                        </span>
                      </span>
                      <span className="clx-dim jbx-desk">#{j.jobNumber}</span>
                      <span className={`jbx-desk ${when ? "" : "clx-faint"}`}>{when ?? "Unscheduled"}</span>
                      <span className="jbx-c-st">
                        <StatusChip kind="job" status={j.status} />
                      </span>
                      {showMoney && (
                        <span className="jbx-money jbx-desk">{total > 0 ? money(total) : <span className="clx-faint">—</span>}</span>
                      )}
                      <ChevronRight size={15} className="clx-chev" aria-hidden />
                    </Link>
                  </EntityRowActions>
                );
              })}
              <div className="jbx-foot">
                <span>
                  Showing {jobs.length.toLocaleString("en-US")} of {listCount.toLocaleString("en-US")}
                </span>
                {showMoney && pageTotal > 0 && <span className="jbx-foot-total">{money(pageTotal)}</span>}
              </div>
            </div>
          )}
          <Pager
            basePath="/app/jobs"
            params={{ status: validStatus, unscheduled, q: query, sort: sortRaw }}
            page={page}
            pageSize={PAGE_SIZE}
            total={listCount}
          />
        </section>
      </BandBody>
    </DsPage>
  );

  return desktop;
}
