import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck, Inbox, Search, Phone, Mail, MapPin, ExternalLink, CalendarPlus, MessageSquare, Globe } from "lucide-react";
import { BandBody, Button, Chip, DsPage, PageHeader } from "@/components/ds";
import FilterSelect from "@/components/FilterSelect";
import CallLink from "@/components/CallLink";
import { money } from "@/lib/statuses";
import { slotLabel } from "@/lib/booking-engine";
import RequestActions from "./[id]/RequestActions";
import BookingApprovalBanner from "./[id]/BookingApprovalBanner";
import PageTitle from "@/components/PageTitle";
import { FilterChip } from "@/components/FilterChips";
import FilterBar, { listHref } from "@/components/FilterBar";
import { pickSort, REQUEST_SORTS, requestOrderBy } from "@/lib/list-sort";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
import { InboxBand, waitedFor } from "@/components/ListBands";
import MobileSearch from "@/components/MobileSearch";
import Monogram from "@/components/Monogram";
import Pager from "@/components/Pager";
import { requirePageActor, canSell, viaContactScope, seesAllLeads, isManager } from "@/lib/permissions";
import EntityRowActions from "@/components/EntityRowActions";
import type { RequestStatus } from "@prisma/client";

const PAGE_SIZE = 100;

const statusFilters: { value: string; label: string; mobile: string }[] = [
  { value: "", label: "All", mobile: "All requests" },
  { value: "NEEDS_APPROVAL", label: "Needs approval", mobile: "Needs approval" },
  { value: "NEW", label: "New", mobile: "New" },
  { value: "CONVERTED", label: "Converted", mobile: "Converted" },
  { value: "ARCHIVED", label: "Archived", mobile: "Archived" },
];

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; assignee?: string; q?: string; page?: string; sort?: string; r?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;
  // Dates render in the company's zone — the server clock is UTC.
  const companyRow = await prisma.company.findUnique({
    where: { id: companyId },
    select: { timezone: true, arrivalWindowMinutes: true },
  });
  const tz = companyRow?.timezone ?? "America/Chicago";

  const { status, assignee, q, page: pageParam, sort: sortRaw, r: pickedId } = await searchParams;
  const sort = pickSort(sortRaw, REQUEST_SORTS);
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const query = q?.trim() || undefined;
  const search = query
    ? {
        OR: [
          { title: { contains: query, mode: "insensitive" as const } },
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
  const validStatus = ["NEW", "NEEDS_APPROVAL", "CONVERTED", "ARCHIVED"].includes(status ?? "")
    ? (status as RequestStatus)
    : undefined;

  const showAll = seesAllLeads(actor.role);
  const mineOnly = showAll && assignee === "me";
  const scope = {
    ...viaContactScope(actor),
    ...(mineOnly ? { contact: { assignedToId: actor.id } } : {}),
  };

  const listWhere = { companyId, ...scope, ...(validStatus ? { status: validStatus } : {}), ...search };
  const [requests, listCount, newCount, needsApprovalCount, waitingList] = await Promise.all([
    prisma.request.findMany({
      where: listWhere,
      include: { contact: true },
      orderBy: requestOrderBy(sort),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.request.count({ where: listWhere }),
    prisma.request.count({ where: { companyId, ...scope, status: "NEW" } }),
    prisma.request.count({ where: { companyId, ...scope, status: "NEEDS_APPROVAL" } }),
    // The band's inbox: what's waiting on a reply, oldest first
    prisma.request.findMany({
      where: { companyId, ...scope, status: { in: ["NEW", "NEEDS_APPROVAL"] } },
      orderBy: { createdAt: "asc" },
      take: 5,
      select: { id: true, title: true, status: true, createdAt: true, contact: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const cur = { status: validStatus, assignee: mineOnly ? "me" : undefined, q: query, sort: sortRaw };

  // ── Desktop inbox (2026-11-24, David: "Requests can go with your inbox
  // idea"): the list on the left, the picked request opened beside it.
  // ?r=<id> picks (linkable, server-rendered); default = the first in the list.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [statusGroups, weekCount] = await Promise.all([
    prisma.request.groupBy({
      by: ["status"],
      where: { companyId, ...scope, ...search },
      _count: { _all: true },
    }),
    prisma.request.count({ where: { companyId, ...scope, createdAt: { gte: weekAgo } } }),
  ]);
  const tabCount: Record<string, number> = { "": 0 };
  for (const g of statusGroups) {
    tabCount[g.status] = g._count._all;
    tabCount[""] += g._count._all;
  }
  const pickId = pickedId && requests.some((r) => r.id === pickedId) ? pickedId : (requests[0]?.id ?? null);
  const picked = pickId
    ? await prisma.request.findFirst({
        where: { id: pickId, companyId, ...viaContactScope(actor) },
        include: {
          contact: true,
          quotes: { orderBy: { createdAt: "desc" } },
          jobs: { orderBy: { createdAt: "desc" } },
          appointments: { orderBy: { scheduledAt: "asc" } },
          estimator: { select: { id: true, name: true } },
          bookingType: { select: { name: true } },
        },
      })
    : null;
  const tentativeAppt =
    picked?.status === "NEEDS_APPROVAL"
      ? (picked.appointments.find((a) => a.tentative && a.status === "SCHEDULED") ?? null)
      : null;
  const sourceLabel: Record<string, string> = {
    internal: "Added in WorkBench",
    client_hub: "Client portal",
    booking_form: "Booking page",
    estimate_form: "Estimate form",
    webhook: "Website form",
  };
  const pickHref = (id: string) => {
    const base = listHref("/app/requests", cur, {});
    return `${base}${base.includes("?") ? "&" : "?"}r=${id}${page > 1 ? `&page=${page}` : ""}`;
  };
  const contextLine = [
    newCount > 0 ? `${newCount} new` : null,
    needsApprovalCount > 0 ? `${needsApprovalCount} to approve` : null,
    `${weekCount} this week`,
    waitingList[0] ? `oldest waiting ${waitedFor(waitingList[0].createdAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const pc = picked?.contact ?? null;
  const pcName = pc ? `${pc.firstName} ${pc.lastName}`.trim() : "";

  const desktop = (
    <DsPage
      open
      header={
        <PageHeader
          eyebrow={contextLine}
          title="Requests"
          actions={
            <>
              {isManager(actor.role) && (
                <Button href="/app/settings/booking" variant="outline" icon={Globe}>
                  Booking & forms
                </Button>
              )}
              <Button href="/app/requests/new" icon={Plus}>
                New request
              </Button>
            </>
          }
        />
      }
    >
      <BandBody>
        <section className="rqx">
          <div className="clx-filters">
            <form action="/app/requests" className="clx-search" role="search">
              <Search size={15} aria-hidden />
              <input type="search" name="q" defaultValue={query} placeholder="Search requests, clients" aria-label="Search requests" />
              {validStatus && <input type="hidden" name="status" value={validStatus} />}
              {mineOnly && <input type="hidden" name="assignee" value="me" />}
              {sortRaw && <input type="hidden" name="sort" value={sortRaw} />}
            </form>
            <nav className="clx-tabs" aria-label="Show">
              {statusFilters.map((o) => {
                const on = (validStatus ?? "") === o.value;
                return (
                  <Link
                    key={o.value}
                    prefetch={false}
                    href={listHref("/app/requests", cur, { status: o.value || undefined })}
                    aria-current={on ? "page" : undefined}
                    className={`clx-tab ${on ? "is-on" : ""}`}
                  >
                    {o.label}
                    <span className="clx-tab-n">{(tabCount[o.value] ?? 0).toLocaleString("en-US")}</span>
                  </Link>
                );
              })}
            </nav>
            <span className="clx-filters-end">
              {showAll && (
                <Link
                  prefetch={false}
                  href={listHref("/app/requests", cur, { assignee: mineOnly ? undefined : "me" })}
                  aria-pressed={mineOnly}
                  className={`clx-mine ${mineOnly ? "is-on" : ""}`}
                >
                  <UserCheck size={14} />
                  Mine
                </Link>
              )}
              <FilterSelect
                icon="sort"
                value={sort}
                options={REQUEST_SORTS.map((o) => ({ value: o.value, label: o.label, href: listHref("/app/requests", cur, { sort: o.value }) }))}
                align="right"
              />
            </span>
          </div>

          {requests.length === 0 ? (
            <div className="py-10">
              <EmptyState
                art="requests"
                hue="var(--ds-primary)"
                title={validStatus || query ? "No requests match this filter" : "No requests yet"}
                body={
                  validStatus || query
                    ? "Try a different status or search, or log a request yourself."
                    : "New work starts here — requests arrive from your booking page and contact forms, or log them yourself."
                }
                actionHref="/app/requests/new"
                actionLabel="Create a request"
              />
            </div>
          ) : (
            <div className="rqx-split">
              <div className="rqx-list" role="list" aria-label="Requests">
                {requests.map((r) => {
                  const on = r.id === pickId;
                  const waiting = r.status === "NEW" || r.status === "NEEDS_APPROVAL";
                  return (
                    <EntityRowActions
                      key={r.id}
                      meta={{ kind: "request", id: r.id, title: r.title, status: r.status, contactId: r.contactId, canDelete: isManager(actor.role) }}
                    >
                      <Link
                        prefetch={false}
                        href={pickHref(r.id)}
                        scroll={false}
                        role="listitem"
                        aria-current={on ? "true" : undefined}
                        className={`rqx-row ${on ? "is-on" : ""}`}
                      >
                        {r.status === "NEW" && <span className="rqx-dot" aria-label="New" />}
                        <span className="rqx-row-top">
                          <span className="rqx-name">{`${r.contact.firstName} ${r.contact.lastName}`.trim() || "Client"}</span>
                          <span className="rqx-when">{waiting ? `${waitedFor(r.createdAt)} ago` : shortDate(r.createdAt, tz)}</span>
                        </span>
                        <span className="rqx-title">{r.title}</span>
                        <span className="rqx-sub">
                          <span className="truncate">{sourceLabel[r.source] ?? "Request"}</span>
                          {r.status !== "NEW" && <StatusChip kind="request" status={r.status} className="shrink-0" />}
                        </span>
                      </Link>
                    </EntityRowActions>
                  );
                })}
                {listCount > PAGE_SIZE && (
                  <div className="px-2 py-3">
                    <Pager
                      basePath="/app/requests"
                      params={{ status: validStatus, assignee: mineOnly ? "me" : undefined, sort: sortRaw, q: query }}
                      page={page}
                      pageSize={PAGE_SIZE}
                      total={listCount}
                    />
                  </div>
                )}
              </div>

              {picked && pc ? (
                <article className="rqx-detail" aria-label={picked.title}>
                  {picked.status === "NEEDS_APPROVAL" && (
                    <BookingApprovalBanner
                      requestId={picked.id}
                      clientName={pcName}
                      windowLabel={
                        tentativeAppt && companyRow
                          ? slotLabel(
                              tz,
                              tentativeAppt.scheduledAt,
                              new Date(tentativeAppt.scheduledAt.getTime() + companyRow.arrivalWindowMinutes * 60000)
                            )
                          : null
                      }
                    />
                  )}
                  <header className="rqx-head">
                    <div className="min-w-0">
                      <p className="rqx-kicker">
                        Request #{picked.requestNumber} · {shortDate(picked.createdAt, tz)}
                        <Link prefetch={false} href={`/app/requests/${picked.id}`} className="rqx-full">
                          Open full page
                          <ExternalLink size={12} />
                        </Link>
                      </p>
                      <h2 className="rqx-h">{picked.title}</h2>
                      <p className="rqx-client">
                        <Link prefetch={false} href={`/app/contacts/${pc.id}`} className="rqx-client-name">
                          {pcName || "Client"}
                        </Link>
                        {pc.phone && (
                          <>
                            <span aria-hidden>·</span>
                            <CallLink phone={pc.phone} contactId={pc.id} name={pcName} className="rqx-link">
                              <Phone size={13} />
                              {pc.phone}
                            </CallLink>
                          </>
                        )}
                        {pc.email && (
                          <>
                            <span aria-hidden>·</span>
                            <a href={`mailto:${pc.email}`} className="rqx-link">
                              <Mail size={13} />
                              {pc.email}
                            </a>
                          </>
                        )}
                      </p>
                      {pc.address && (
                        <p className="rqx-addr">
                          <MapPin size={13} />
                          {pc.address}
                          {pc.city ? `, ${pc.city}` : ""} {pc.state} {pc.zip}
                        </p>
                      )}
                    </div>
                    <StatusChip kind="request" status={picked.status} className="shrink-0" />
                  </header>

                  <blockquote className="rqx-msg">
                    {picked.details?.trim() ? picked.details : <span className="rqx-none">No details provided.</span>}
                  </blockquote>

                  <dl className="rqx-facts">
                    <div>
                      <dt>Came from</dt>
                      <dd>
                        {picked.estimator ? (
                          <Link prefetch={false} href={`/app/estimates/${picked.estimator.id}?s=leads`} className="rqx-link">
                            {picked.estimator.name} form
                          </Link>
                        ) : (
                          (sourceLabel[picked.source] ?? "Request") + (picked.bookingType ? ` · ${picked.bookingType.name}` : "")
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Client prefers</dt>
                      <dd className={picked.preferredDate ? "rqx-prefer" : "rqx-none"}>
                        {picked.preferredDate ? shortDate(picked.preferredDate, tz) : "No date given"}
                      </dd>
                    </div>
                    <div>
                      <dt>Waiting</dt>
                      <dd>
                        {picked.status === "NEW" || picked.status === "NEEDS_APPROVAL" ? waitedFor(picked.createdAt) : "Answered"}
                      </dd>
                    </div>
                  </dl>

                  <div className="rqx-actions">
                    <RequestActions
                      requestId={picked.id}
                      status={picked.status}
                      contactId={picked.contactId}
                      title={picked.title}
                      details={picked.details ?? ""}
                      quote={picked.quotes[0] ? { id: picked.quotes[0].id, quoteNumber: picked.quotes[0].quoteNumber, status: picked.quotes[0].status } : null}
                      canDelete={isManager(actor.role)}
                    />
                    <Link
                      prefetch={false}
                      href={`/app/appointments/new?requestId=${picked.id}${picked.preferredDate ? `&date=${picked.preferredDate.toISOString().slice(0, 10)}` : ""}`}
                      className="ds-btn ds-btn-outline"
                    >
                      <CalendarPlus size={16} strokeWidth={2.2} />
                      Schedule a visit
                    </Link>
                    <Link prefetch={false} href={`/app/messages/thread/${pc.id}`} className="ds-btn ds-btn-outline">
                      <MessageSquare size={16} strokeWidth={2.2} />
                      Message
                    </Link>
                  </div>

                  {(picked.appointments.length > 0 || picked.quotes.length > 0 || picked.jobs.length > 0) && (
                    <div className="rqx-linked">
                      <p className="bb-label">Used for</p>
                      <div className="bb-rows">
                        {picked.appointments.map((a) => (
                          <Link key={a.id} prefetch={false} href={`/app/appointments/${a.id}`} className="bb-row">
                            <span className="bb-row-main">
                              <span className="bb-row-title">{a.title}</span>
                              <span className="bb-row-sub">
                                {a.scheduledAnytime
                                  ? `${shortDate(a.scheduledAt, tz)}, anytime`
                                  : new Date(a.scheduledAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz })}
                              </span>
                            </span>
                            {a.tentative && a.status === "SCHEDULED" && <Chip tone="warn">Tentative</Chip>}
                            <StatusChip kind="appointment" status={a.status} />
                          </Link>
                        ))}
                        {picked.quotes.map((qq) => (
                          <Link key={qq.id} prefetch={false} href={`/app/quotes/${qq.id}`} className="bb-row">
                            <span className="bb-row-main">
                              <span className="bb-row-title">Quote #{qq.quoteNumber}</span>
                            </span>
                            <span className="ds-num text-[13.5px] font-semibold">{money(qq.total)}</span>
                            <StatusChip kind="quote" status={qq.status} />
                          </Link>
                        ))}
                        {picked.jobs.map((j) => (
                          <Link key={j.id} prefetch={false} href={`/app/jobs/${j.id}`} className="bb-row">
                            <span className="bb-row-main">
                              <span className="bb-row-title">Job #{j.jobNumber}</span>
                              <span className="bb-row-sub">{j.scheduledAt ? shortDate(j.scheduledAt, tz) : "Not scheduled"}</span>
                            </span>
                            <StatusChip kind="job" status={j.status} />
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              ) : (
                <div className="rqx-detail rqx-none">Pick a request to read it here.</div>
              )}
            </div>
          )}
        </section>
      </BandBody>
    </DsPage>
  );

  return (
    <>
    <div className="p-4 lg:p-8 max-w-6xl mx-auto lg:hidden">
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 lg:mb-6">
        <PageTitle heavy section="requests" icon={Inbox}>
          Requests
        </PageTitle>
        {/* Phones create from the tab-bar FAB */}
        <Link
          href="/app/requests/new"
          className="btn-primary hidden lg:flex"
        >
          <Plus size={15} />
          New request
        </Link>
      </div>

      <MobileSearch
        action="/app/requests"
        placeholder="Search requests, clients…"
        defaultValue={query}
        params={{ status: validStatus, assignee: mineOnly ? "me" : undefined, sort: sortRaw }}
      />

      <InboxBand
        waiting={newCount + needsApprovalCount}
        oldest={waitingList[0] ? waitedFor(waitingList[0].createdAt) : null}
        items={waitingList.map((r) => ({
          id: r.id,
          name: `${r.contact.firstName} ${r.contact.lastName}`.trim(),
          title: r.title,
          age: waitedFor(r.createdAt),
          approval: r.status === "NEEDS_APPROVAL",
        }))}
        needsApproval={{ count: needsApprovalCount, href: "/app/requests?status=NEEDS_APPROVAL" }}
        allHref="/app/requests?status=NEW"
      />

      <FilterBar
        options={statusFilters}
        value={validStatus ?? ""}
        href={(v) => listHref("/app/requests", cur, { status: v })}
        scope={
          showAll ? (
            <FilterChip
              hue="var(--ds-primary)"
              active={mineOnly}
              href={listHref("/app/requests", cur, { assignee: mineOnly ? undefined : "me" })}
            >
              <UserCheck size={13} />
              Mine
            </FilterChip>
          ) : undefined
        }
        sort={{
          options: REQUEST_SORTS,
          value: sort,
          href: (v) => listHref("/app/requests", cur, { sort: v }),
        }}
      />

      <div className="ds-card overflow-hidden">
        {requests.length === 0 ? (
          <EmptyState
            art="requests"
            hue="var(--ds-primary)"
            title={validStatus ? "No requests with this status" : "No requests yet"}
            body={
              validStatus
                ? "Try a different status, or log a request yourself."
                : "New work starts here — requests arrive from your booking page and contact forms, or log them yourself."
            }
            actionHref="/app/requests/new"
            actionLabel="Create a request"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            <div className="hidden lg:grid grid-cols-[1fr_1fr_140px_130px_40px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
              <span>Client</span>
              <span>Title</span>
              <span>Requested</span>
              <span>Status</span>
              <span></span>
            </div>
            {requests.map((r) => (
              <EntityRowActions
                key={r.id}
                meta={{ kind: "request", id: r.id, title: r.title, status: r.status, contactId: r.contactId, canDelete: isManager(actor.role) }}
              >
              <Link
                prefetch={false} href={`/app/requests/${r.id}`}
                className="ds-trow block lg:grid lg:grid-cols-[1fr_1fr_140px_130px_40px] lg:gap-4 lg:items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                {/* Phone row: monogram anchor, the work leads, the client
                    supports */}
                <div className="lg:hidden flex min-w-0 items-center gap-3">
                  <Monogram
                    name={`${r.contact.firstName} ${r.contact.lastName}`}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="min-w-0 flex-1 ds-trow-name truncate text-[15.5px] font-semibold text-gray-900">
                        {r.title}
                      </p>
                      <p className="shrink-0 text-xs text-gray-500">{shortDate(r.createdAt, tz)}</p>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-[13px] text-gray-600">
                        {r.contact.firstName} {r.contact.lastName}
                      </p>
                      <StatusChip kind="request" status={r.status} className="shrink-0" />
                    </div>
                  </div>
                </div>
                <span className="ds-trow-name hidden lg:block text-sm font-medium text-gray-900">
                  {r.contact.firstName} {r.contact.lastName}
                </span>
                <span className="hidden lg:block text-sm text-gray-600 truncate">{r.title}</span>
                <span className="hidden lg:block text-sm text-gray-500">{shortDate(r.createdAt, tz)}</span>
                <span className="hidden lg:block">
                  <StatusChip kind="request" status={r.status} />
                </span>
                <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
              </Link>
              </EntityRowActions>
            ))}
          </div>
        )}
      </div>
      <Pager
        basePath="/app/requests"
        params={{
          status: validStatus,
          assignee: mineOnly ? "me" : undefined, sort: sortRaw,
          q: query,
        }}
        page={page}
        pageSize={PAGE_SIZE}
        total={listCount}
      />
    </div>
      {/* desktop tree after the phone one: phone tests take the first matching link */}
      <div className="hidden lg:block">{desktop}</div>
    </>
  );
}
