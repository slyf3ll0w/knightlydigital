import { prisma } from "@/lib/db";
import { dealLine } from "@/lib/empty-lines";
import { headerNote } from "@/lib/header-notes";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck, Upload, ListPlus, Users, Download, Phone, Search } from "lucide-react";
import { BandBody, Button, Chip, DsPage, PageHeader } from "@/components/ds";
import FilterSelect from "@/components/FilterSelect";
import PageTitle from "@/components/PageTitle";
import { FilterChip } from "@/components/FilterChips";
import FilterBar, { listHref } from "@/components/FilterBar";
import MobileSearch from "@/components/MobileSearch";
import { pickSort, CLIENT_SORTS, clientOrderBy } from "@/lib/list-sort";
import Pager from "@/components/Pager";
import { shortDate } from "@/lib/statuses";
import ContactStatus from "@/components/ContactStatus";
import EmptyState from "@/components/EmptyState";
import { requirePageActor, canSell, contactScope, seesAllLeads, isManager, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { money } from "@/lib/statuses";
import { invoiceBalance } from "@/lib/payments";
import { zonedMidnight, zonedParts } from "@/lib/timezone";
import ClientBook, { type BookMonth } from "@/components/ClientBook";
import EntityRowActions from "@/components/EntityRowActions";
import CallLink from "@/components/CallLink";
import { contactSearchWhere } from "@/lib/contact-search";
import Monogram, { monogramColor } from "@/components/Monogram";
import PdfLink from "@/components/PdfLink";

// Leads live on the Leads board now — this page is clients (searching still
// finds leads so the header search never dead-ends). Contacts = business
// connections (Contact.kind CONTACT): subs, suppliers, referral partners —
// kept in the same book, never leads, clients the day they get a job.
const statusFilters = [
  { value: "", label: "Clients" },
  { value: "CONTACTS", label: "Contacts" },
  { value: "ARCHIVED", label: "Archived" },
  // Leads marked lost on the board (also listed under the board's Lost button)
  { value: "LOST", label: "Lost leads" },
];

const PAGE_SIZE = 100;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; assignee?: string; page?: string; sort?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  // One true line from this company's numbers, dealt per visit (lib/header-notes.ts)
  const pageNote = await headerNote("clients", actor);
  const companyId = actor.companyId;
  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  const { q, status, assignee, page: pageParam, sort: sortRaw } = await searchParams;
  const sort = pickSort(sortRaw, CLIENT_SORTS);
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const validStatus = ["ARCHIVED", "CONTACTS", "LOST"].includes(status ?? "")
    ? (status as "ARCHIVED" | "CONTACTS" | "LOST")
    : undefined;
  const contactsTab = validStatus === "CONTACTS";

  // Managers can flip to "Mine"; sales/user are always scoped to theirs
  const showAll = seesAllLeads(actor.role);
  const mineOnly = showAll && assignee === "me";

  // Covers the built-in columns and the company's own custom fields — see
  // lib/contact-search.ts.
  const search = await contactSearchWhere(companyId, q);

  const listWhere = {
    companyId,
    ...contactScope(actor),
    ...(mineOnly ? { assignedToId: actor.id } : {}),
    // An unsaved texted number (Messages → New message) lives in the inbox only
    placeholder: false,
    // A search sweeps every status and kind (so leads and contacts are still
    // findable here); otherwise the list is active clients, the Contacts
    // tab (business connections, not archived), or the Archived tab
    ...(contactsTab
      ? { kind: "CONTACT" as const, status: { not: "ARCHIVED" as const } }
      : validStatus === "ARCHIVED"
        ? { status: "ARCHIVED" as const }
        : validStatus === "LOST"
          ? { lostAt: { not: null }, pipelineStageId: null }
          : q
          ? {}
          : { status: "ACTIVE" as const, kind: "CLIENT" as const }),
    ...(search ?? {}),
  };
  const [contacts, listCount] = await Promise.all([
    prisma.contact.findMany({
      where: listWhere,
      include: { assignedTo: { select: { name: true } } },
      orderBy: clientOrderBy(sort),
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.contact.count({ where: listWhere }),
  ]);

  // Row extras for the clients on this page: when their last job was and
  // what they still owe (open invoices, less payments).
  const seeMoney = canSeeMoney(actor);
  const ids = contacts.map((c) => c.id);
  // The picture: the default Clients view only (not a search, tab or later page)
  const showBook = !q && !validStatus && page === 1;
  const nowParts = zonedParts(tz, new Date());
  const monthStarts = Array.from({ length: 12 }, (_, k) => zonedMidnight(tz, nowParts.y, nowParts.m - (11 - k), 1));
  const bookWhere = {
    companyId,
    ...contactScope(actor),
    ...(mineOnly ? { assignedToId: actor.id } : {}),
    placeholder: false,
    status: "ACTIVE" as const,
    kind: "CLIENT" as const,
  };
  // Tab counts for the desktop filter row (same scope, no search)
  const tabBase = {
    companyId,
    ...contactScope(actor),
    ...(mineOnly ? { assignedToId: actor.id } : {}),
    placeholder: false,
  };
  const [lastJobs, openInvoices, newClients, owedAll, nextJobs, tabCounts] = await Promise.all([
    ids.length
      ? prisma.job.groupBy({
          by: ["contactId"],
          where: { companyId, contactId: { in: ids }, scheduledAt: { not: null } },
          _max: { scheduledAt: true },
        })
      : Promise.resolve([] as { contactId: string; _max: { scheduledAt: Date | null } }[]),
    seeMoney && ids.length
      ? prisma.invoice.findMany({
          where: { companyId, contactId: { in: ids }, status: { in: ["PAST_DUE", "AWAITING_PAYMENT"] } },
          select: { contactId: true, status: true, total: true, payments: { select: { amount: true, surchargeAmount: true } } },
        })
      : Promise.resolve([]),
    showBook
      ? prisma.contact.findMany({
          where: { ...bookWhere, createdAt: { gte: monthStarts[0] } },
          select: { id: true, firstName: true, lastName: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 2000,
        })
      : Promise.resolve([]),
    seeMoney
      ? prisma.invoice.findMany({
          where: { companyId, ...viaContactScope(actor), status: { in: ["PAST_DUE", "AWAITING_PAYMENT"] } },
          select: { contactId: true, total: true, payments: { select: { amount: true, surchargeAmount: true } } },
        })
      : Promise.resolve([]),
    // Next visit on the books per client (desktop column)
    ids.length
      ? prisma.job.groupBy({
          by: ["contactId"],
          where: { companyId, contactId: { in: ids }, status: "ACTIVE", scheduledAt: { gte: new Date() } },
          _min: { scheduledAt: true },
        })
      : Promise.resolve([] as { contactId: string; _min: { scheduledAt: Date | null } }[]),
    Promise.all([
      prisma.contact.count({ where: { ...tabBase, status: "ACTIVE", kind: "CLIENT" } }),
      prisma.contact.count({ where: { ...tabBase, kind: "CONTACT", status: { not: "ARCHIVED" } } }),
      prisma.contact.count({ where: { ...tabBase, status: "ARCHIVED" } }),
      prisma.contact.count({ where: { ...tabBase, lostAt: { not: null }, pipelineStageId: null } }),
    ]),
  ]);
  const nextJobBy = new Map(nextJobs.map((j) => [j.contactId, j._min.scheduledAt]));
  const tabCount: Record<string, number> = { "": tabCounts[0], CONTACTS: tabCounts[1], ARCHIVED: tabCounts[2], LOST: tabCounts[3] };
  const lastJobBy = new Map(lastJobs.map((j) => [j.contactId, j._max.scheduledAt]));
  const owesBy = new Map<string, { amount: number; late: boolean }>();
  for (const i of openInvoices) {
    const bal = Math.max(0, invoiceBalance(i));
    if (bal <= 0 || !i.contactId) continue;
    const prev = owesBy.get(i.contactId) ?? { amount: 0, late: false };
    owesBy.set(i.contactId, { amount: prev.amount + bal, late: prev.late || i.status === "PAST_DUE" });
  }
  let owed: { clients: number; amount: number; href: string } | null = null;
  if (seeMoney) {
    const per = new Map<string, number>();
    for (const i of owedAll) {
      const bal = Math.max(0, invoiceBalance(i));
      if (bal > 0 && i.contactId) per.set(i.contactId, (per.get(i.contactId) ?? 0) + bal);
    }
    owed = { clients: per.size, amount: [...per.values()].reduce((a, b) => a + b, 0), href: "/app/invoices" };
  }
  const months: BookMonth[] = monthStarts.map((start, k) => {
    const end = monthStarts[k + 1]?.getTime() ?? Infinity;
    const inMonth = newClients.filter((c) => c.createdAt.getTime() >= start.getTime() && c.createdAt.getTime() < end);
    return {
      label: start.toLocaleDateString("en-US", { month: "short", timeZone: tz }),
      long: start.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: tz }),
      count: inMonth.length,
      people: inMonth.slice(0, 4).map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`.trim() || "Client" })),
      now: k === 11,
    };
  });
  // Desktop ledger columns: Name · Address · Status · (Assigned) · Last job · (Owes) · call
  const cols = [
    "minmax(0,1.3fr)",
    "minmax(0,1fr)",
    "110px",
    ...(showAll ? ["120px"] : []),
    "96px",
    ...(seeMoney ? ["96px"] : []),
    "40px",
  ].join(" ");

  const cur = { q, status: validStatus, assignee: mineOnly ? "me" : undefined, sort: sortRaw };

  // ── Desktop: the branded header + an open list (app/ds-brand.css, app/ds-clients.css) ──
  const desktopCols = [
    "minmax(0,1.6fr)",
    "136px",
    "104px",
    "112px",
    ...(showAll ? ["118px"] : []),
    ...(q || validStatus ? ["104px"] : []),
    ...(seeMoney ? ["170px"] : []),
    "40px",
  ].join(" ");
  const initials = (f: string, l: string) => `${(f || "").charAt(0)}${(l || "").charAt(0)}`.toUpperCase() || "?";
  const noun = contactsTab ? (tabCount.CONTACTS === 1 ? "contact" : "contacts") : tabCount[""] === 1 ? "client" : "clients";
  const eyebrow = [
    `${(contactsTab ? tabCount.CONTACTS : tabCount[""]).toLocaleString("en-US")} ${noun}`,
    owed && owed.clients > 0 ? `${owed.clients} owe you ${money(owed.amount)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const desktop = (
    <DsPage
      open
      header={
          <PageHeader
            note={pageNote}
            eyebrow={eyebrow}
            title={contactsTab ? "Contacts" : "Clients"}
            actions={
              <>
                {isManager(actor.role) && (
                  <>
                    <Button href="/app/settings/client-fields" variant="outline" icon={ListPlus}>
                      Custom fields
                    </Button>
                    <Button href="/app/settings/import" variant="outline" icon={Upload}>
                      Import
                    </Button>
                    <PdfLink
                      href="/api/app/export/clients"
                      ariaLabel="Export CSV"
                      title="Download all clients as CSV"
                      className="ds-btn ds-btn-outline"
                      mime="text/csv"
                      newTab={false}
                      fallbackName="export.csv"
                    >
                      <Download size={17} />
                      Export
                    </PdfLink>
                  </>
                )}
                <Button href={contactsTab ? "/app/contacts/new?type=contact" : "/app/contacts/new"} icon={Plus}>
                  {contactsTab ? "New contact" : "New client"}
                </Button>
              </>
            }
          />
      }
    >
      <BandBody>
        <section className="clx">
          <div className="clx-filters">
            <form action="/app/contacts" className="clx-search" role="search">
              <Search size={15} aria-hidden />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Search name, company, address, custom fields"
                aria-label="Search clients"
              />
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
                    href={listHref("/app/contacts", cur, { status: o.value || undefined })}
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
                  href={listHref("/app/contacts", cur, { assignee: mineOnly ? undefined : "me" })}
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
                options={CLIENT_SORTS.map((o) => ({ value: o.value, label: o.label, href: listHref("/app/contacts", cur, { sort: o.value }) }))}
                align="right"
              />
            </span>
          </div>

          {contacts.length === 0 ? (
            <div className="clx-empty">
              <EmptyState
                art="contacts"
                title={contactsTab && !q ? "No contacts yet" : q || validStatus ? "No clients match this filter" : "No clients yet"}
                body={
                  contactsTab && !q
                    ? "Business connections — subs, suppliers, referral partners — live here, apart from your clients. Schedule one a job and they move to Clients."
                    : q || validStatus
                      ? dealLine("no-match", { thing: "clients", one: "client" })
                      : "Your client list powers everything — quotes, jobs, and invoices all start here."
                }
                actionHref={contactsTab ? "/app/contacts/new?type=contact" : "/app/contacts/new"}
                actionLabel={contactsTab ? "Add a contact" : "Add your first client"}
              />
            </div>
          ) : (
            <div className="clx-table" style={{ "--clx-cols": desktopCols } as React.CSSProperties}>
              <div className="clx-head" role="presentation">
                <span>Name</span>
                <span>Phone</span>
                <span>Last job</span>
                <span>Next visit</span>
                {showAll && <span>Assigned to</span>}
                {(q || validStatus) && <span>Status</span>}
                {seeMoney && <span className="r">Balance</span>}
                <span />
              </div>
              {contacts.map((c, i) => {
                const owes = owesBy.get(c.id);
                const lastJob = lastJobBy.get(c.id) ?? null;
                const nextJob = nextJobBy.get(c.id) ?? null;
                const name = `${c.firstName} ${c.lastName}`.trim();
                return (
                  <EntityRowActions
                    key={c.id}
                    meta={{ kind: "client", id: c.id, name, phone: c.phone, status: c.status, canDelete: isManager(actor.role) }}
                  >
                    <Link
                      prefetch={false}
                      href={`/app/contacts/${c.id}`}
                      className="clx-row"
                      style={{ "--ds-i": Math.min(i, 12) } as React.CSSProperties}
                    >
                      <span className="clx-name">
                        <span className="clx-mono" aria-hidden>{initials(c.firstName, c.lastName)}</span>
                        <span className="min-w-0">
                          <span className="clx-name-t">{name || "Client"}</span>
                          <span className="clx-name-s">
                            {[c.companyName, c.email, [c.address, c.city].filter(Boolean).join(", ")].filter(Boolean)[0] ?? ""}
                          </span>
                        </span>
                      </span>
                      <span className="clx-dim">{c.phone || "—"}</span>
                      <span className={lastJob ? "" : "clx-faint"} title={`Last updated ${shortDate(c.updatedAt, tz)}`}>
                        {lastJob ? shortDate(lastJob, tz) : "None yet"}
                      </span>
                      <span className={nextJob ? "" : "clx-faint"}>{nextJob ? shortDate(nextJob, tz) : "None"}</span>
                      {showAll && <span className="clx-dim clx-trunc">{c.assignedTo?.name ?? "—"}</span>}
                      {(q || validStatus) && <ContactStatus status={c.status} kind={c.kind} />}
                      {seeMoney && (
                        <span className="clx-bal">
                          {owes ? (
                            <>
                              {owes.late && <Chip tone="bad">Past due</Chip>}
                              <span className={owes.late ? "clx-bal-late" : "clx-bal-open"}>{money(owes.amount)}</span>
                            </>
                          ) : (
                            <span className="clx-faint">$0.00</span>
                          )}
                        </span>
                      )}
                      <span aria-hidden>{!c.phone && <ChevronRight size={15} className="clx-chev" />}</span>
                    </Link>
                    {c.phone && (
                      <CallLink
                        phone={c.phone}
                        contactId={c.id}
                        name={name}
                        aria-label={`Call ${name}`}
                        title="Call"
                        className="clx-call"
                      >
                        <Phone size={15} />
                      </CallLink>
                    )}
                  </EntityRowActions>
                );
              })}
              <div className="clx-foot">
                Showing {contacts.length.toLocaleString("en-US")} of {listCount.toLocaleString("en-US")}
              </div>
            </div>
          )}
          <Pager
            basePath="/app/contacts"
            params={{ q: q?.trim() || undefined, status: validStatus, assignee: mineOnly ? "me" : undefined, sort: sortRaw }}
            page={page}
            pageSize={PAGE_SIZE}
            total={listCount}
          />
        </section>
      </BandBody>
    </DsPage>
  );

  return (
    <>
    <div className="p-4 lg:p-8 max-w-6xl mx-auto lg:hidden">
      {/* Header — secondary actions collapse to icon circles on phones so the
          row never crams; labels return at sm. */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <PageTitle heavy section="clients" icon={Users}>
          Clients
        </PageTitle>
        <div className="flex items-center gap-2">
          {isManager(actor.role) && (
            <>
              <Link
                href="/app/settings/client-fields"
                aria-label="Custom fields"
                title="Custom fields"
                className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors sm:w-auto sm:px-4"
              >
                <ListPlus size={15} />
                <span className="hidden sm:inline">Custom fields</span>
              </Link>
              <Link
                href="/app/settings/import"
                aria-label="Import"
                title="Import"
                className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors sm:w-auto sm:px-4"
              >
                <Upload size={15} />
                <span className="hidden sm:inline">Import</span>
              </Link>
              <PdfLink
                href="/api/app/export/clients"
                ariaLabel="Export CSV"
                title="Download all clients as CSV"
                className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors sm:w-auto sm:px-4" mime="text/csv" newTab={false} fallbackName="export.csv">
                <Download size={15} />
                <span className="hidden sm:inline">Export</span>
              </PdfLink>
            </>
          )}
          {/* Phones create from the tab-bar FAB (the form has the Contact option) */}
          <Link
            href={contactsTab ? "/app/contacts/new?type=contact" : "/app/contacts/new"}
            className="btn-primary hidden lg:flex h-10"
          >
            <Plus size={15} />
            {contactsTab ? "New contact" : "New client"}
          </Link>
        </div>
      </div>

      <MobileSearch
        action="/app/contacts"
        placeholder="Search name, company, address, custom fields…"
        defaultValue={q}
        params={{ status: validStatus, assignee: mineOnly ? "me" : undefined, sort: sortRaw }}
      />

      <FilterBar
        options={statusFilters}
        value={validStatus ?? ""}
        href={(v) => listHref("/app/contacts", cur, { status: v })}
        scope={
          showAll ? (
            <FilterChip
              hue=""
              active={mineOnly}
              href={listHref("/app/contacts", cur, { assignee: mineOnly ? undefined : "me" })}
            >
              <UserCheck size={13} />
              Mine
            </FilterChip>
          ) : undefined
        }
        sort={{
          options: CLIENT_SORTS,
          value: sort,
          href: (v) => listHref("/app/contacts", cur, { sort: v }),
        }}
      />

      {showBook && listCount > 0 && <ClientBook total={listCount} months={months} owed={owed} />}

      <div className="ds-card overflow-hidden">
        {contacts.length === 0 ? (
          <EmptyState
            art="contacts"
            title={
              contactsTab && !q
                ? "No contacts yet"
                : q || validStatus
                  ? "No clients match this filter"
                  : "No clients yet"
            }
            body={
              contactsTab && !q
                ? "Business connections — subs, suppliers, referral partners — live here, apart from your clients. Schedule one a job and they move to Clients."
                : q || validStatus
                  ? dealLine("no-match", { thing: "clients", one: "client" })
                  : "Your client list powers everything — quotes, jobs, and invoices all start here."
            }
            actionHref={contactsTab ? "/app/contacts/new?type=contact" : "/app/contacts/new"}
            actionLabel={contactsTab ? "Add a contact" : "Add your first client"}
          />
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              <div
                className="ds-cl-head hidden lg:grid gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50"
                style={{ gridTemplateColumns: cols }}
              >
                <span>Name</span>
                <span>Address</span>
                <span>Status</span>
                {showAll && <span>Assigned To</span>}
                <span>Last job</span>
                {seeMoney && <span className="text-right">Owes</span>}
                <span></span>
              </div>
              {contacts.map((c) => {
                const owes = owesBy.get(c.id);
                const lastJob = lastJobBy.get(c.id) ?? null;
                return (
                <EntityRowActions
                  key={c.id}
                  meta={{ kind: "client", id: c.id, name: `${c.firstName} ${c.lastName}`, phone: c.phone, status: c.status, canDelete: isManager(actor.role) }}
                >
                <Link
                  prefetch={false} href={`/app/contacts/${c.id}`}
                  style={{ "--row-tone": monogramColor(`${c.firstName} ${c.lastName}`), "--cl-cols": cols } as React.CSSProperties}
                  className="ds-trow ds-cl-row flex lg:grid gap-3 lg:gap-4 items-center px-4 py-3 lg:py-2.5 hover:bg-[color:var(--ds-surface-2)] active:bg-[color:var(--ds-line)] transition-colors"
                >
                  {/* Monogram anchors the phone row (identity color, not a
                      section hue) — desktop keeps the dense ledger grid */}
                  <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none">
                    <Monogram name={`${c.firstName} ${c.lastName}`} size={40} className="ds-cl-mono" />
                    <div className="min-w-0 flex-1">
                      <p className="ds-trow-name text-[15.5px] lg:text-sm font-semibold text-gray-900 truncate">
                        {c.firstName} {c.lastName}
                      </p>
                      {(c.companyName || c.phone || c.email || owes) && (
                        <p className="text-[13px] lg:text-xs text-gray-500 truncate">
                          {owes && (
                            <span className={`ds-cl-owes-inline lg:hidden ${owes.late ? "is-late" : ""}`}>
                              Owes {money(owes.amount)}
                              {c.companyName || c.phone || c.email ? " · " : ""}
                            </span>
                          )}
                          {[c.companyName, c.phone || c.email].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="hidden lg:block text-sm text-gray-500 truncate">
                    {[c.address, c.city, c.state].filter(Boolean).join(", ") || "—"}
                  </span>
                  <ContactStatus status={c.status} kind={c.kind} />
                  {showAll && (
                    <span className="hidden lg:block text-sm text-gray-500 truncate">
                      {c.assignedTo?.name ?? "—"}
                    </span>
                  )}
                  <span className="hidden lg:block text-sm text-gray-500" title={`Last updated ${shortDate(c.updatedAt, tz)}`}>
                    {lastJob ? shortDate(lastJob, tz) : <span className="text-gray-400">No jobs</span>}
                  </span>
                  {seeMoney && (
                    <span className={`ds-cl-owes hidden lg:block text-right text-sm ${owes ? (owes.late ? "is-late" : "is-open") : ""}`}>
                      {owes ? money(owes.amount) : "—"}
                    </span>
                  )}
                  {/* The last column holds the Call button (below, outside the link) when there's a phone. */}
                  {c.phone ? <span className="hidden lg:block w-9" /> : <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />}
                </Link>
                {/* Call from the card, like a lead card — a sibling of the link, since a link can't nest one. */}
                {c.phone && (
                  <CallLink
                    phone={c.phone}
                    contactId={c.id}
                    name={`${c.firstName} ${c.lastName}`.trim()}
                    aria-label={`Call ${c.firstName} ${c.lastName}`}
                    title="Call"
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 lg:right-4"
                  >
                    <Phone size={15} />
                  </CallLink>
                )}
                </EntityRowActions>
                );
              })}
            </div>
            {/* Ledger foot — entry count */}
            <div className="border-t border-[color:var(--ds-line)] bg-[color:var(--ds-surface-2)] px-4 py-2.5">
              <span className="text-xs font-medium text-gray-500">
                {contacts.length}{" "}
                {contactsTab ? (contacts.length === 1 ? "contact" : "contacts") : contacts.length === 1 ? "client" : "clients"}
              </span>
            </div>
          </>
        )}
      </div>
      <Pager
        basePath="/app/contacts"
        params={{
          q: q?.trim() || undefined,
          status: validStatus,
          assignee: mineOnly ? "me" : undefined,
          sort: sortRaw,
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
