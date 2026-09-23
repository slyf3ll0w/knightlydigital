import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck, Upload, ListPlus, Users, Download, Phone } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES } from "@/lib/section-colors";
import { FilterChip } from "@/components/FilterChips";
import FilterBar, { listHref } from "@/components/FilterBar";
import MobileSearch from "@/components/MobileSearch";
import { pickSort, CLIENT_SORTS, clientOrderBy } from "@/lib/list-sort";
import Pager from "@/components/Pager";
import { shortDate } from "@/lib/statuses";
import ContactStatus from "@/components/ContactStatus";
import EmptyState from "@/components/EmptyState";
import { requirePageActor, canSell, contactScope, seesAllLeads, isManager } from "@/lib/permissions";
import { contactSearchWhere } from "@/lib/contact-search";
import Monogram from "@/components/Monogram";

// Leads live on the Leads board now — this page is clients (searching still
// finds leads so the header search never dead-ends).
const statusFilters = [
  { value: "", label: "Clients" },
  { value: "ARCHIVED", label: "Archived" },
];

const PAGE_SIZE = 100;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; assignee?: string; page?: string; sort?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;
  // Dates render in the company's zone — the server clock is UTC.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";

  const { q, status, assignee, page: pageParam, sort: sortRaw } = await searchParams;
  const sort = pickSort(sortRaw, CLIENT_SORTS);
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const validStatus = ["ARCHIVED"].includes(status ?? "")
    ? (status as "ARCHIVED")
    : undefined;

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
    // A search sweeps every status (so leads are still findable here);
    // otherwise the list is active clients, or the Archived tab
    status: validStatus ? validStatus : q ? undefined : ("ACTIVE" as const),
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

  const cur = { q, status: validStatus, assignee: mineOnly ? "me" : undefined, sort: sortRaw };

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      {/* Header — secondary actions collapse to icon circles on phones so the
          row never crams; labels return at sm. */}
      <div className="flex items-center justify-between gap-2 mb-6">
        <PageTitle section="clients" icon={Users}>
          Clients
        </PageTitle>
        <div className="flex items-center gap-2">
          {isManager(actor.role) && (
            <>
              <Link
                href="/app/settings/client-fields"
                aria-label="Custom Fields"
                title="Custom Fields"
                className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors sm:w-auto sm:px-4"
              >
                <ListPlus size={15} />
                <span className="hidden sm:inline">Custom Fields</span>
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
              <a
                href="/api/app/export/clients"
                aria-label="Export CSV"
                title="Download all clients as CSV"
                className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors sm:w-auto sm:px-4"
              >
                <Download size={15} />
                <span className="hidden sm:inline">Export</span>
              </a>
            </>
          )}
          {/* Phones create from the tab-bar FAB */}
          <Link
            href="/app/contacts/new"
            className="btn-primary hidden lg:flex h-10"
          >
            <Plus size={15} />
            New Client
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
        hue={SECTION_HUES.clients}
        options={statusFilters}
        value={validStatus ?? ""}
        href={(v) => listHref("/app/contacts", cur, { status: v })}
        scope={
          showAll ? (
            <FilterChip
              hue={SECTION_HUES.clients}
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

      <div className="card-ledger overflow-hidden">
        {contacts.length === 0 ? (
          <EmptyState
            art="contacts"
            title={q || validStatus ? "No clients match this filter" : "No clients yet"}
            body={
              q || validStatus
                ? "Try a different search or status filter."
                : "Your client list powers everything — quotes, jobs, and invoices all start here."
            }
            actionHref="/app/contacts/new"
            actionLabel="Add Your First Client"
          />
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              <div className="hidden lg:grid grid-cols-[1fr_1fr_110px_120px_120px_40px] gap-4 px-4 py-2 text-xs font-medium text-gray-500 bg-gray-50">
                <span>Name</span>
                <span>Address</span>
                <span>Status</span>
                <span>Assigned To</span>
                <span>Last Activity</span>
                <span></span>
              </div>
              {contacts.map((c) => (
                <div key={c.id} className="relative">
                <Link
                  prefetch={false} href={`/app/contacts/${c.id}`}
                  className="flex lg:grid lg:grid-cols-[1fr_1fr_110px_120px_120px_40px] gap-3 lg:gap-4 items-center px-4 py-3 lg:py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  {/* Monogram anchors the phone row (identity color, not a
                      section hue) — desktop keeps the dense ledger grid */}
                  <Monogram
                    name={`${c.firstName} ${c.lastName}`}
                    size={40}
                    className="lg:hidden"
                  />
                  <div className="min-w-0 flex-1 lg:flex-none">
                    <p className="text-[15.5px] lg:text-sm font-semibold lg:font-medium text-gray-900 truncate">
                      {c.firstName} {c.lastName}
                    </p>
                    {(c.companyName || c.phone || c.email) && (
                      <p className="text-[13px] lg:text-xs text-gray-500 truncate">
                        {[c.companyName, c.phone || c.email].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="hidden lg:block text-sm text-gray-500 truncate">
                    {[c.address, c.city, c.state].filter(Boolean).join(", ") || "—"}
                  </span>
                  <ContactStatus status={c.status} />
                  <span className="hidden lg:block text-sm text-gray-500 truncate">
                    {c.assignedTo?.name ?? "—"}
                  </span>
                  <span className="hidden lg:block text-sm text-gray-500">
                    {shortDate(c.updatedAt, tz)}
                  </span>
                  {/* The last column holds the Call button (below, outside the link) when there's a phone. */}
                  {c.phone ? <span className="hidden lg:block w-9" /> : <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />}
                </Link>
                {/* Call from the card, like a lead card — a sibling of the link, since a link can't nest one. */}
                {c.phone && (
                  <a
                    href={`tel:${c.phone.replace(/[^\d+]/g, "")}`}
                    aria-label={`Call ${c.firstName} ${c.lastName}`}
                    title="Call"
                    className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 active:bg-gray-300 lg:right-4"
                  >
                    <Phone size={15} />
                  </a>
                )}
                </div>
              ))}
            </div>
            {/* Ledger foot — entry count */}
            <div className="border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5">
              <span className="text-xs font-medium text-gray-500">
                {contacts.length} {contacts.length === 1 ? "client" : "clients"}
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
  );
}
