import { prisma } from "@/lib/db";
import { dealLine } from "@/lib/empty-lines";
import { headerNote } from "@/lib/header-notes";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck, Upload, ListPlus, Download, Phone, Search } from "lucide-react";
import { BandBody, Button, Chip, DsPage, PageHeader } from "@/components/ds";
import FilterSelect from "@/components/FilterSelect";
import { listHref } from "@/components/FilterBar";
import { pickSort, CLIENT_SORTS, clientOrderBy } from "@/lib/list-sort";
import Pager from "@/components/Pager";
import { shortDate } from "@/lib/statuses";
import ContactStatus from "@/components/ContactStatus";
import EmptyState from "@/components/EmptyState";
import { requirePageActor, canSell, contactScope, seesAllLeads, isManager, canSeeMoney, viaContactScope } from "@/lib/permissions";
import { money } from "@/lib/statuses";
import { invoiceBalance } from "@/lib/payments";
import EntityRowActions from "@/components/EntityRowActions";
import CallLink from "@/components/CallLink";
import { contactSearchWhere } from "@/lib/contact-search";
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
  // Tab counts for the desktop filter row (same scope, no search)
  const tabBase = {
    companyId,
    ...contactScope(actor),
    ...(mineOnly ? { assignedToId: actor.id } : {}),
    placeholder: false,
  };
  const [lastJobs, openInvoices, owedAll, nextJobs, tabCounts] = await Promise.all([
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
  const cur = { q, status: validStatus, assignee: mineOnly ? "me" : undefined, sort: sortRaw };

  // The open list (app/ds-clients.css; phones: app/ds-open-client.css)
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
      className="cl-list"
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

  return desktop;
}
