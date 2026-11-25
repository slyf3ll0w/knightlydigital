import { prisma } from "@/lib/db";
import { dealLine } from "@/lib/empty-lines";
import { headerNote } from "@/lib/header-notes";
import { requirePageActor, canSeeMoney, viaContactScope, isManager } from "@/lib/permissions";
import EntityRowActions from "@/components/EntityRowActions";
import Link from "next/link";
import { Plus, ChevronRight, DollarSign, Download, Search } from "lucide-react";
import { BandBody, Button, DsPage, PageHeader } from "@/components/ds";
import FilterSelect from "@/components/FilterSelect";
import { listHref } from "@/components/FilterBar";
import { pickSort, INVOICE_SORTS, invoiceOrderBy } from "@/lib/list-sort";
import { money, shortDate } from "@/lib/statuses";
import { pastDueFilter } from "@/lib/due-dates";
import { invoiceBalance } from "@/lib/payments";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import { MoneyBand } from "@/components/ListBands";
import { startOfMonthIn, zonedMidnight, zonedParts } from "@/lib/timezone";
import Pager from "@/components/Pager";
import type { InvoiceStatus } from "@prisma/client";
import PdfLink from "@/components/PdfLink";

const statusFilters = [
  { value: "", label: "All", mobile: "All" },
  { value: "DRAFT", label: "Draft", mobile: "Draft" },
  // Presentation filter: drafts parked with Send later (not an InvoiceStatus)
  { value: "SCHEDULED", label: "Scheduled", mobile: "Scheduled" },
  { value: "AWAITING_PAYMENT", label: "Awaiting Payment", mobile: "Awaiting" },
  { value: "PAST_DUE", label: "Past Due", mobile: "Past due" },
  { value: "PAID", label: "Paid", mobile: "Paid" },
  { value: "ARCHIVED", label: "Archived", mobile: "Archived" },
];

const PAGE_SIZE = 100;

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string; sort?: string }>;
}) {
  const actor = await requirePageActor(canSeeMoney);
  // One true line from this company's numbers, dealt per visit (lib/header-notes.ts)
  const pageNote = await headerNote("invoices", actor);
  const companyId = actor.companyId;
  const scope = viaContactScope(actor);
  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  const { status, q, page: pageParam, sort: sortRaw } = await searchParams;
  const sort = pickSort(sortRaw, INVOICE_SORTS);
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const scheduledOnly = status === "SCHEDULED";
  const validStatus = ["DRAFT", "AWAITING_PAYMENT", "PAST_DUE", "PAID", "ARCHIVED"].includes(
    status ?? ""
  )
    ? (status as InvoiceStatus)
    : undefined;
  const query = q?.trim() || undefined;
  const search = query
    ? {
        OR: [
          { subject: { contains: query, mode: "insensitive" as const } },
          ...(Number.isInteger(Number(query)) && query !== ""
            ? [{ invoiceNumber: Number(query) }]
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

  // Surface past-due invoices automatically (awaiting payment + the whole due
  // day has passed — an invoice due today isn't late yet). The hourly cron
  // does the same flip; this is the catch-up for the hour in between. Probe
  // first (indexed, lock-free) so a plain list render never takes row locks.
  const pastDueWhere = { companyId, status: "AWAITING_PAYMENT" as const, dueDate: pastDueFilter() };
  if (await prisma.invoice.findFirst({ where: pastDueWhere, select: { id: true } })) {
    await prisma.invoice.updateMany({ where: pastDueWhere, data: { status: "PAST_DUE" } });
  }

  // "All" means the live ledger — archived invoices only show on their own tab
  // (or in a search, so a shelved invoice is still findable)
  const listWhere = {
    companyId,
    ...scope,
    ...(scheduledOnly
      ? { status: "DRAFT" as InvoiceStatus, scheduledSendAt: { not: null } }
      : validStatus
        ? { status: validStatus }
        : query
          ? {}
          : { status: { not: "ARCHIVED" as InvoiceStatus } }),
    ...search,
  };
  // The Collected card's spark: the first instant of each of the last 6 months
  const nowParts = zonedParts(tz, new Date());
  const monthStarts = Array.from({ length: 6 }, (_, k) => zonedMidnight(tz, nowParts.y, nowParts.m - (5 - k), 1));
  const [invoices, listCount, pastDue, awaiting, draft, openForBalance, paidMonth, paid6m, statusCounts, scheduledCount] = await Promise.all([
    prisma.invoice.findMany({
      where: listWhere,
      include: { contact: true, payments: true },
      orderBy: invoiceOrderBy(sort),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.invoice.count({ where: listWhere }),
    prisma.invoice.aggregate({
      where: { companyId, ...scope, status: "PAST_DUE" },
      _count: true,
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { companyId, ...scope, status: "AWAITING_PAYMENT" },
      _count: true,
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: { companyId, ...scope, status: "DRAFT" },
      _count: true,
      _sum: { total: true },
    }),
    // What is still OWED on the open invoices — the same balance the
    // dashboard's Outstanding and Insights show. The tiles used to sum full
    // totals, so a $1,000 invoice with $600 paid read $1,000 here, $400 there.
    prisma.invoice.findMany({
      where: { companyId, ...scope, status: { in: ["PAST_DUE", "AWAITING_PAYMENT"] } },
      select: {
        id: true,
        status: true,
        total: true,
        dueDate: true,
        contact: { select: { firstName: true, lastName: true } },
        payments: { select: { amount: true, surchargeAmount: true } },
      },
    }),
    prisma.payment.aggregate({
      where: { companyId, ...scope, paidAt: { gte: startOfMonthIn(tz, new Date()) } },
      _sum: { amount: true },
    }),
    prisma.payment.findMany({
      where: { companyId, ...scope, paidAt: { gte: monthStarts[0] } },
      select: { amount: true, paidAt: true },
    }),
    // Desktop tabs: how many sit in each status (the list's own scope, no search)
    prisma.invoice.groupBy({ by: ["status"], where: { companyId, ...scope }, _count: true }),
    prisma.invoice.count({ where: { companyId, ...scope, status: "DRAFT", scheduledSendAt: { not: null } } }),
  ]);
  const collectedMonths = monthStarts.map((start, k) => {
    const end = monthStarts[k + 1]?.getTime() ?? Infinity;
    const value = paid6m
      .filter((pm) => pm.paidAt && pm.paidAt.getTime() >= start.getTime() && pm.paidAt.getTime() < end)
      .reduce((sum, pm) => sum + Number(pm.amount), 0);
    const label = start.toLocaleDateString("en-US", { month: "long", timeZone: tz });
    return { label: k === 5 ? `${label} so far` : label, value, display: money(value) };
  });
  const owedBy = (status: "PAST_DUE" | "AWAITING_PAYMENT") =>
    openForBalance.filter((i) => i.status === status).reduce((s, i) => s + Math.max(0, invoiceBalance(i)), 0);


  // Ledger foot: totals for the rows currently shown
  const pageTotal = invoices.reduce((s, i) => s + Number(i.total), 0);
  const pageBalance = invoices.reduce(
    (s, i) => s + Math.max(0, invoiceBalance(i)),
    0
  );

  // ── The open page (2026-11-24; phones too since 2026-11-25) — the page's
  // own header with a context line, the money picture kept, underline tabs
  // with counts, then the ledger as hairline rows. On a phone each row folds
  // to two lines (app/ds-open-money.css): name + "#, due" on the left, the
  // amount that matters + status on the right.
  const byStatus = new Map(statusCounts.map((c) => [c.status as string, c._count]));
  const tabCount: Record<string, number> = {
    "": statusCounts.filter((c) => c.status !== "ARCHIVED").reduce((n, c) => n + c._count, 0),
    DRAFT: byStatus.get("DRAFT") ?? 0,
    SCHEDULED: scheduledCount,
    AWAITING_PAYMENT: byStatus.get("AWAITING_PAYMENT") ?? 0,
    PAST_DUE: byStatus.get("PAST_DUE") ?? 0,
    PAID: byStatus.get("PAID") ?? 0,
    ARCHIVED: byStatus.get("ARCHIVED") ?? 0,
  };
  const owedTotal = owedBy("PAST_DUE") + owedBy("AWAITING_PAYMENT");
  const unpaidCount = pastDue._count + awaiting._count;
  const eyebrow = [
    unpaidCount > 0 ? `${unpaidCount} unpaid` : "Nothing unpaid",
    owedTotal > 0 ? `${money(owedTotal)} owed` : null,
    owedBy("PAST_DUE") > 0 ? `${money(owedBy("PAST_DUE"))} past due` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const currentTab = scheduledOnly ? "SCHEDULED" : (validStatus ?? "");
  const initials = (first?: string | null, last?: string | null) =>
    `${(first ?? "").charAt(0)}${(last ?? "").charAt(0)}`.toUpperCase() || "—";
  const desktop = (
    <DsPage
      open
      header={
        <PageHeader
          note={pageNote}
          eyebrow={eyebrow}
          title="Invoices"
          actions={
            <>
              <PdfLink
                href="/api/app/export/invoices"
                title="Download all invoices as CSV"
                className="ds-btn ds-btn-outline mx-desk"
                mime="text/csv"
                newTab={false}
                fallbackName="export.csv"
              >
                <Download size={17} />
                Export
              </PdfLink>
              <Button href="/app/payments/new" variant="outline" icon={DollarSign} className="mx-desk">
                Collect payment
              </Button>
              <Button href="/app/invoices/new" icon={Plus}>
                New invoice
              </Button>
            </>
          }
        />
      }
    >
      <BandBody>
        <div className="mx-pic">
          <MoneyBand
            pastDue={{ amount: owedBy("PAST_DUE"), count: pastDue._count, href: "/app/invoices?status=PAST_DUE" }}
            awaiting={{ amount: owedBy("AWAITING_PAYMENT"), count: awaiting._count, href: "/app/invoices?status=AWAITING_PAYMENT" }}
            draft={{ amount: Number(draft._sum.total) || 0, count: draft._count, href: "/app/invoices?status=DRAFT" }}
            paidThisMonth={{ amount: Number(paidMonth._sum.amount) || 0, href: "/app/payments" }}
            collectedMonths={collectedMonths}
            open={openForBalance
              .map((i) => ({
                id: i.id,
                name: i.contact ? `${i.contact.firstName} ${i.contact.lastName}`.trim() : "No client",
                amount: Math.max(0, invoiceBalance(i)),
                daysLate: i.dueDate ? Math.floor((Date.now() - i.dueDate.getTime()) / 86400000) : null,
              }))
              .filter((o) => o.amount > 0)}
          />
        </div>

        <section className="mx-list">
          <div className="mx-filters">
            <form action="/app/invoices" className="mx-search" role="search">
              <Search size={15} aria-hidden />
              <input type="search" name="q" defaultValue={query} placeholder="Search client, subject or number" aria-label="Search invoices" />
              {currentTab && <input type="hidden" name="status" value={currentTab} />}
              {sortRaw && <input type="hidden" name="sort" value={sortRaw} />}
            </form>
            <nav className="mx-tabs" aria-label="Status">
              {statusFilters.map((o) => {
                const on = currentTab === o.value;
                return (
                  <Link
                    key={o.value}
                    prefetch={false}
                    href={listHref("/app/invoices", { q: query, sort: sortRaw }, { status: o.value || undefined })}
                    aria-current={on ? "page" : undefined}
                    className={`mx-tab ${on ? "is-on" : ""} ${o.value === "PAST_DUE" && tabCount.PAST_DUE > 0 ? "is-bad" : ""}`}
                  >
                    {o.mobile}
                    <span className="mx-tab-n">{(tabCount[o.value] ?? 0).toLocaleString("en-US")}</span>
                  </Link>
                );
              })}
            </nav>
            <span className="mx-filters-end">
              <FilterSelect
                icon="sort"
                value={sort}
                options={INVOICE_SORTS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  href: listHref("/app/invoices", { status: currentTab || undefined, q: query }, { sort: o.value }),
                }))}
                align="right"
              />
            </span>
          </div>

          {invoices.length === 0 ? (
            <div className="mx-empty">
              <EmptyState
                art="invoices"
                hue="var(--ds-primary)"
                title={validStatus || scheduledOnly || query ? "No invoices match this filter" : "No invoices yet"}
                body={
                  validStatus || scheduledOnly || query
                    ? dealLine("no-match", { thing: "invoices", one: "invoice" })
                    : "Get paid for finished work — send your first invoice with a pay-online link."
                }
                actionHref="/app/invoices/new"
                actionLabel="Create an invoice"
              />
            </div>
          ) : (
            <div className="mx-table mx-table-inv">
              <div className="mx-head" role="presentation">
                <span>Client</span>
                <span>#</span>
                <span>Issued</span>
                <span>Due</span>
                <span>Status</span>
                <span className="r">Total</span>
                <span className="r">Balance</span>
                <span />
              </div>
              {invoices.map((inv, i) => {
                const balance = Math.max(0, invoiceBalance(inv));
                const name = inv.contact ? `${inv.contact.firstName} ${inv.contact.lastName}`.trim() : "";
                const late = inv.status === "PAST_DUE" && balance > 0;
                return (
                  <EntityRowActions
                    key={inv.id}
                    meta={{ kind: "invoice", id: inv.id, number: inv.invoiceNumber, status: inv.status, hasPayments: inv.payments.length > 0, hasEmail: Boolean(inv.contact?.email), canDelete: isManager(actor.role) }}
                  >
                    <Link
                      prefetch={false}
                      href={`/app/invoices/${inv.id}`}
                      className="mx-row ds-trow"
                      style={{ "--ds-i": Math.min(i, 12) } as React.CSSProperties}
                    >
                      <span className="mx-name">
                        <span className="mx-mono" aria-hidden>{inv.contact ? initials(inv.contact.firstName, inv.contact.lastName) : "—"}</span>
                        <span className="min-w-0">
                          <span className="mx-name-t ds-trow-name">{name || "No client"}</span>
                          <span className="mx-name-s mx-desk">{inv.subject ?? ""}</span>
                          {/* Phone sub line: number, due date while owed, subject */}
                          <span className="mx-name-s mx-ph">
                            #{inv.invoiceNumber}
                            {balance > 0 && inv.dueDate ? ` · Due ${shortDate(inv.dueDate, tz)}` : ""}
                            {inv.subject ? ` · ${inv.subject}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="mx-dim mx-c-n">#{inv.invoiceNumber}</span>
                      <span className={`mx-c-iss ${inv.issuedAt ? "mx-dim" : "mx-faint"}`}>{inv.issuedAt ? shortDate(inv.issuedAt, tz) : "Not sent"}</span>
                      <span className={`mx-c-due ${late ? "mx-late" : inv.dueDate ? "mx-dim" : "mx-faint"}`}>{inv.dueDate ? shortDate(inv.dueDate, tz) : "—"}</span>
                      <span className="mx-c-st">
                        <StatusChip kind="invoice" status={inv.status === "DRAFT" && inv.scheduledSendAt ? "SCHEDULED" : inv.status} />
                      </span>
                      <span className="mx-num mx-dim r mx-c-tot">{money(inv.total)}</span>
                      <span className={`mx-num r mx-c-bal ${balance > 0 ? (late ? "mx-late mx-strong" : "mx-strong") : "mx-faint"}`}>{money(balance)}</span>
                      {/* Phone: one amount — the balance while anything is owed, else the total */}
                      <span className={`mx-num r mx-ph mx-c-amt ${late ? "mx-late" : ""}`}>{money(balance > 0 ? balance : inv.total)}</span>
                      <ChevronRight size={15} className="mx-chev" aria-hidden />
                    </Link>
                  </EntityRowActions>
                );
              })}
              {/* Ledger foot — totals for the rows shown, double-ruled like a register */}
              <div className="mx-foot">
                <span>
                  {invoices.length === listCount
                    ? `${invoices.length} ${invoices.length === 1 ? "invoice" : "invoices"}`
                    : `Showing ${invoices.length.toLocaleString("en-US")} of ${listCount.toLocaleString("en-US")}`}
                </span>
                <span />
                <span />
                <span />
                <span />
                <span className="mx-num r">{money(pageTotal)}</span>
                <span className="mx-num r ds-ledger-total">{money(pageBalance)}</span>
                <span />
                <span className="mx-num r ds-ledger-total mx-ph">{money(pageBalance > 0 ? pageBalance : pageTotal)}</span>
              </div>
            </div>
          )}
          <Pager
            basePath="/app/invoices"
            params={{ status: validStatus, q: query, sort: sortRaw }}
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
