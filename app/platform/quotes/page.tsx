import { prisma } from "@/lib/db";
import { dealLine } from "@/lib/empty-lines";
import { headerNote } from "@/lib/header-notes";
import { requirePageActor, canSell, viaContactScope, isManager } from "@/lib/permissions";
import EntityRowActions from "@/components/EntityRowActions";
import Link from "next/link";
import { Plus, ChevronRight, Download, Search } from "lucide-react";
import { BandBody, Button, DsPage, PageHeader } from "@/components/ds";
import FilterSelect from "@/components/FilterSelect";
import { listHref } from "@/components/FilterBar";
import { pickSort, QUOTE_SORTS, quoteOrderBy } from "@/lib/list-sort";
import { money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import { PipelineBand } from "@/components/ListBands";
import Pager from "@/components/Pager";
import type { QuoteStatus } from "@prisma/client";
import PdfLink from "@/components/PdfLink";

const statusFilters = [
  { value: "", label: "All", mobile: "All quotes" },
  { value: "DRAFT", label: "Draft", mobile: "Draft" },
  // Presentation filter: drafts parked with Send later (not a QuoteStatus)
  { value: "SCHEDULED", label: "Scheduled", mobile: "Scheduled" },
  { value: "AWAITING_RESPONSE", label: "Awaiting Response", mobile: "Awaiting response" },
  { value: "APPROVED", label: "Approved", mobile: "Approved" },
  { value: "CHANGES_REQUESTED", label: "Changes Requested", mobile: "Changes requested" },
  { value: "CONVERTED", label: "Converted", mobile: "Converted" },
  { value: "ARCHIVED", label: "Archived", mobile: "Archived" },
];

const validValues = statusFilters.map((f) => f.value).filter(Boolean);

const PAGE_SIZE = 100;

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  // One true line from this company's numbers, dealt per visit (lib/header-notes.ts)
  const pageNote = await headerNote("quotes", actor);
  const companyId = actor.companyId;
  const scope = viaContactScope(actor);
  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  const { status, q, page: pageParam, sort: sortRaw } = await searchParams;
  const sort = pickSort(sortRaw, QUOTE_SORTS);
  const scheduledOnly = status === "SCHEDULED";
  const validStatus =
    !scheduledOnly && validValues.includes(status ?? "") ? (status as QuoteStatus) : undefined;
  const query = q?.trim() || undefined;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const search = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
          ...(Number.isInteger(Number(query)) && query !== ""
            ? [{ quoteNumber: Number(query) }]
            : []),
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
    ...(scheduledOnly
      ? { status: "DRAFT" as QuoteStatus, scheduledSendAt: { not: null } }
      : validStatus
        ? { status: validStatus }
        : // "All" is everything still in play — archived quotes live only
          // under their own tab (David 2026-10-27)
          { status: { not: "ARCHIVED" as QuoteStatus } }),
    ...search,
  };


  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

  const [quotes, listCount, byStatus, approved60, made90, madeSent90, sent90, sentWon90, waitingRows, tabStatus, scheduledCount] = await Promise.all([
    prisma.quote.findMany({
      where: listWhere,
      include: { contact: true },
      orderBy: quoteOrderBy(sort),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.quote.count({ where: listWhere }),
    prisma.quote.groupBy({
      by: ["status"],
      where: { companyId, ...scope, status: { in: ["DRAFT", "AWAITING_RESPONSE", "APPROVED"] } },
      _count: true,
      _sum: { total: true },
    }),
    // Won: every approval in the last 60 days (this 30 and the 30 before), by day
    prisma.quote.findMany({
      where: { companyId, ...scope, approvedAt: { gte: sixtyDaysAgo } },
      select: { approvedAt: true, total: true },
    }),
    // Stage-to-stage rates over 90 days: new → sent, sent → approved
    prisma.quote.count({ where: { companyId, ...scope, createdAt: { gte: ninetyDaysAgo } } }),
    prisma.quote.count({ where: { companyId, ...scope, createdAt: { gte: ninetyDaysAgo }, sentAt: { not: null } } }),
    prisma.quote.count({ where: { companyId, ...scope, sentAt: { gte: ninetyDaysAgo } } }),
    prisma.quote.count({ where: { companyId, ...scope, sentAt: { gte: ninetyDaysAgo }, approvedAt: { not: null } } }),
    // Waiting on a reply: oldest send first (the average reads all of them, capped)
    prisma.quote.findMany({
      where: { companyId, ...scope, status: "AWAITING_RESPONSE", sentAt: { not: null } },
      orderBy: { sentAt: "asc" },
      take: 300,
      select: { id: true, title: true, total: true, sentAt: true, contact: { select: { firstName: true, lastName: true } } },
    }),
    // Desktop tab counts: every status in scope (search left out, like Clients)
    prisma.quote.groupBy({ by: ["status"], where: { companyId, ...scope }, _count: true }),
    prisma.quote.count({ where: { companyId, ...scope, status: "DRAFT", scheduledSendAt: { not: null } } }),
  ]);
  const nowMs = Date.now();
  const DAYMS = 86400000;
  // Won: running total of approved value by day, the last 30 days against the 30 before
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const dayLabel = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
  const wonByDay = new Map<string, number>();
  for (const q of approved60) {
    if (!q.approvedAt) continue;
    const k = dayKey.format(q.approvedAt);
    wonByDay.set(k, (wonByDay.get(k) ?? 0) + Number(q.total));
  }
  let runCur = 0;
  let runPrev = 0;
  const wonPoints = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(nowMs - (29 - i) * DAYMS);
    const pd = new Date(d.getTime() - 30 * DAYMS);
    runCur += wonByDay.get(dayKey.format(d)) ?? 0;
    runPrev += wonByDay.get(dayKey.format(pd)) ?? 0;
    return { label: dayLabel.format(d), cur: runCur, prev: runPrev, prevLabel: dayLabel.format(pd) };
  });
  const wonTotal = runCur;
  const wonPrevTotal = runPrev;

  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
  const waitDays = waitingRows.map((q) => Math.max(0, Math.floor((nowMs - q.sentAt!.getTime()) / DAYMS)));
  const avgWait = waitDays.length > 0 ? waitDays.reduce((a, b) => a + b, 0) / waitDays.length : null;
  const stalest = waitingRows.slice(0, 3).map((q, i) => ({
    id: q.id,
    name: `${q.contact.firstName} ${q.contact.lastName}`.trim() || "No name",
    title: q.title ?? "Quote",
    amount: Number(q.total),
    days: waitDays[i],
    href: `/app/quotes/${q.id}`,
  }));

  const stage = (st: QuoteStatus) => byStatus.find((b) => b.status === st);
  const pipeline = (
    [
      ["DRAFT", "Draft"],
      ["AWAITING_RESPONSE", "Awaiting response"],
      ["APPROVED", "Approved"],
    ] as const
  ).map(([key, label]) => ({
    key,
    label,
    count: stage(key)?._count ?? 0,
    amount: Number(stage(key)?._sum.total ?? 0),
    href: `/app/quotes?status=${key}`,
  }));

  const pageTotal = quotes.reduce((s, q) => s + Number(q.total), 0);

  // ── Desktop: the open page (2026-11-24) ─────────────────────────────────
  // Its own header with a context line, the pipeline picture kept from the
  // heavy pilot, then underline tabs with counts and a hairline list.
  const statusN = (st: string) => tabStatus.find((t) => t.status === st)?._count ?? 0;
  const tabCount = (v: string) =>
    v === ""
      ? tabStatus.filter((t) => t.status !== "ARCHIVED").reduce((n, t) => n + t._count, 0)
      : v === "SCHEDULED"
        ? scheduledCount
        : statusN(v);
  const awaiting = pipeline.find((p) => p.key === "AWAITING_RESPONSE");
  const approvedStage = pipeline.find((p) => p.key === "APPROVED");
  const eyebrow = [
    `${tabCount("").toLocaleString("en-US")} ${tabCount("") === 1 ? "quote" : "quotes"} in play`,
    awaiting && awaiting.count > 0 ? `${awaiting.count} waiting on a reply · ${money(awaiting.amount)}` : null,
    approvedStage && approvedStage.count > 0 ? `${approvedStage.count} approved` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const curParams = { status: scheduledOnly ? "SCHEDULED" : validStatus, q: query, sort: sortRaw };
  const tabValue = scheduledOnly ? "SCHEDULED" : (validStatus ?? "");

  const desktop = (
    <DsPage
      open
      header={
        <PageHeader
          note={pageNote}
          eyebrow={eyebrow}
          title="Quotes"
          actions={
            <>
              <PdfLink
                href="/api/app/export/quotes"
                title="Download all quotes as CSV"
                className="ds-btn ds-btn-outline qx-desk"
                mime="text/csv"
                newTab={false}
                fallbackName="export.csv"
              >
                <Download size={17} />
                Export
              </PdfLink>
              <Button href="/app/quotes/new" icon={Plus}>
                New quote
              </Button>
            </>
          }
        />
      }
    >
      <BandBody>
        <PipelineBand
          stages={pipeline}
          showMoney
          rates={{ sent: pct(madeSent90, made90), approved: pct(sentWon90, sent90) }}
          waiting={{ avgDays: avgWait, count: waitingRows.length, stalest, href: "/app/quotes?status=AWAITING_RESPONSE" }}
          won={{ total: wonTotal, prevTotal: wonPrevTotal, points: wonPoints, href: "/app/quotes?status=APPROVED" }}
        />

        <section className="qx">
          <div className="qx-filters">
            <nav className="qx-tabs" aria-label="Show">
              {statusFilters.map((o) => {
                const on = tabValue === o.value;
                const n = tabCount(o.value);
                if (!on && o.value !== "" && n === 0 && (o.value === "SCHEDULED" || o.value === "ARCHIVED")) return null;
                return (
                  <Link
                    key={o.value}
                    prefetch={false}
                    href={listHref("/app/quotes", { q: query, sort: sortRaw }, { status: o.value || undefined })}
                    aria-current={on ? "page" : undefined}
                    className={`qx-tab ${on ? "is-on" : ""}`}
                  >
                    {o.mobile === "All quotes" ? "All" : o.mobile}
                    <span className="qx-tab-n">{n.toLocaleString("en-US")}</span>
                  </Link>
                );
              })}
            </nav>
            <span className="qx-filters-end">
              <form action="/app/quotes" className="qx-search" role="search">
                <Search size={15} aria-hidden />
                <input type="search" name="q" defaultValue={query} placeholder="Search quotes, clients, #" aria-label="Search quotes" />
                {curParams.status && <input type="hidden" name="status" value={curParams.status} />}
                {sortRaw && <input type="hidden" name="sort" value={sortRaw} />}
              </form>
              <FilterSelect
                icon="sort"
                value={sort}
                options={QUOTE_SORTS.map((o) => ({ value: o.value, label: o.label, href: listHref("/app/quotes", { status: curParams.status, q: query }, { sort: o.value }) }))}
                align="right"
              />
            </span>
          </div>

          {quotes.length === 0 ? (
            <div className="qx-empty">
              <EmptyState
                art="quotes"
                hue="var(--ds-primary)"
                title={validStatus || scheduledOnly || query ? "No quotes match this filter" : "No quotes yet"}
                body={
                  validStatus || scheduledOnly || query
                    ? dealLine("no-match", { thing: "quotes", one: "quote" })
                    : "Win the work before it starts — send your first quote and clients can approve it online."
                }
                actionHref="/app/quotes/new"
                actionLabel="Create a quote"
              />
            </div>
          ) : (
            <div className="qx-table">
              <div className="qx-head" role="presentation">
                <span>Client</span>
                <span>Quote</span>
                <span>Created</span>
                <span>Sent</span>
                <span>Status</span>
                <span className="r">Total</span>
                <span />
              </div>
              <div className="bb-rows">
                {quotes.map((q) => {
                  const name = `${q.contact.firstName} ${q.contact.lastName}`.trim() || "No name";
                  return (
                    <EntityRowActions
                      key={q.id}
                      meta={{ kind: "quote", id: q.id, number: q.quoteNumber, status: q.status, hasEmail: Boolean(q.contact.email), canDelete: isManager(actor.role) }}
                    >
                      <Link prefetch={false} href={`/app/quotes/${q.id}`} className="bb-row qx-row">
                        <span className="min-w-0">
                          <span className="bb-row-title">{name}</span>
                          {q.title && <span className="bb-row-sub qx-desk">{q.title}</span>}
                          {/* Phone sub line: number + title */}
                          <span className="bb-row-sub qx-ph">#{q.quoteNumber}{q.title ? ` · ${q.title}` : ""}</span>
                        </span>
                        <span className="qx-dim qx-desk">#{q.quoteNumber}</span>
                        <span className="qx-dim qx-desk">{shortDate(q.createdAt, tz)}</span>
                        <span className={`qx-desk ${q.sentAt ? "qx-dim" : "qx-faint"}`}>
                          {q.sentAt ? shortDate(q.sentAt, tz) : q.scheduledSendAt ? "Scheduled" : "Not sent"}
                        </span>
                        <span className="qx-c-st">
                          <StatusChip kind="quote" status={q.status === "DRAFT" && q.scheduledSendAt ? "SCHEDULED" : q.status} />
                        </span>
                        <span className="qx-amt">{money(q.total)}</span>
                        <ChevronRight size={15} className="qx-chev" aria-hidden />
                      </Link>
                    </EntityRowActions>
                  );
                })}
              </div>
              <div className="qx-foot">
                <span>
                  Showing {quotes.length.toLocaleString("en-US")} of {listCount.toLocaleString("en-US")}
                </span>
                <span className="qx-foot-total">
                  <span className="bb-label">Quoted on this page</span>
                  <span className="ds-ledger-total">{money(pageTotal)}</span>
                </span>
              </div>
            </div>
          )}
          <Pager
            basePath="/app/quotes"
            params={{ status: curParams.status, q: query, sort: sortRaw }}
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
