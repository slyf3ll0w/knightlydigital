import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight, UserCheck, Upload, ListPlus, Users } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES } from "@/lib/section-colors";
import { FilterRow, FilterChip, FilterDivider } from "@/components/FilterChips";
import { shortDate } from "@/lib/statuses";
import ContactStatus from "@/components/ContactStatus";
import EmptyState from "@/components/EmptyState";
import { requirePageActor, canSell, contactScope, seesAllLeads, isManager } from "@/lib/permissions";

// Leads live on the Leads board now — this page is clients (searching still
// finds leads so the header search never dead-ends).
const statusFilters = [
  { value: "", label: "Clients" },
  { value: "ARCHIVED", label: "Archived" },
];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; assignee?: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { q, status, assignee } = await searchParams;
  const validStatus = ["ARCHIVED"].includes(status ?? "")
    ? (status as "ARCHIVED")
    : undefined;

  // Managers can flip to "Mine"; sales/user are always scoped to theirs
  const showAll = seesAllLeads(actor.role);
  const mineOnly = showAll && assignee === "me";

  const contacts = await prisma.contact.findMany({
    where: {
      companyId,
      ...contactScope(actor),
      ...(mineOnly ? { assignedToId: actor.id } : {}),
      // A search sweeps every status (so leads are still findable here);
      // otherwise the list is active clients, or the Archived tab
      status: validStatus ? validStatus : q ? undefined : "ACTIVE",
      ...(q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    include: { assignedTo: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const statusQS = (v: string) => {
    const p = new URLSearchParams();
    if (v) p.set("status", v);
    if (mineOnly) p.set("assignee", "me");
    const s = p.toString();
    return s ? `/app/contacts?${s}` : "/app/contacts";
  };
  const assigneeQS = (mine: boolean) => {
    const p = new URLSearchParams();
    if (validStatus) p.set("status", validStatus);
    if (mine) p.set("assignee", "me");
    const s = p.toString();
    return s ? `/app/contacts?${s}` : "/app/contacts";
  };

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
                className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors sm:w-auto sm:px-4"
              >
                <ListPlus size={15} />
                <span className="hidden sm:inline">Custom Fields</span>
              </Link>
              <Link
                href="/app/settings/import"
                aria-label="Import"
                title="Import"
                className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-colors sm:w-auto sm:px-4"
              >
                <Upload size={15} />
                <span className="hidden sm:inline">Import</span>
              </Link>
            </>
          )}
          {/* Phones create from the tab-bar FAB */}
          <Link
            href="/app/contacts/new"
            className="hidden lg:flex h-10 items-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-4 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold transition-colors"
          >
            <Plus size={15} />
            New Client
          </Link>
        </div>
      </div>

      {/* Search */}
      <form method="get" className="mb-4">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search clients..."
          className="w-full max-w-sm rounded-[10px] border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {validStatus && <input type="hidden" name="status" value={validStatus} />}
      </form>

      {/* Filter pills — scroll horizontally on phones instead of wrapping */}
      <FilterRow>
        {statusFilters.map((f) => (
          <FilterChip
            key={f.value}
            hue={SECTION_HUES.clients}
            active={(validStatus ?? "") === f.value}
            href={statusQS(f.value)}
          >
            {f.label}
          </FilterChip>
        ))}
        {showAll && (
          <>
            <FilterDivider />
            <FilterChip hue={SECTION_HUES.clients} active={mineOnly} href={assigneeQS(!mineOnly)}>
              <UserCheck size={13} />
              Mine
            </FilterChip>
          </>
        )}
        <FilterDivider />
        <FilterChip hue={SECTION_HUES.clients} active={false} href="/app/leads">
          Leads board →
        </FilterChip>
      </FilterRow>

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
              <div className="hidden lg:grid grid-cols-[1fr_1fr_110px_120px_120px_40px] gap-4 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
                <span>Name</span>
                <span>Address</span>
                <span>Status</span>
                <span>Assigned To</span>
                <span>Last Activity</span>
                <span></span>
              </div>
              {contacts.map((c) => (
                <Link
                  key={c.id}
                  href={`/app/contacts/${c.id}`}
                  className="flex lg:grid lg:grid-cols-[1fr_1fr_110px_120px_120px_40px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {c.firstName} {c.lastName}
                    </p>
                    {(c.companyName || c.phone || c.email) && (
                      <p className="text-xs text-gray-500 truncate">
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
                    {shortDate(c.updatedAt)}
                  </span>
                  <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
                </Link>
              ))}
            </div>
            {/* Ledger foot — entry count */}
            <div className="border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {contacts.length} {contacts.length === 1 ? "client" : "clients"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
