import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus, ChevronRight } from "lucide-react";
import { shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";

const statusFilters = [
  { value: "", label: "Leads and Active" },
  { value: "LEAD", label: "Leads" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { q, status } = await searchParams;
  const validStatus = ["LEAD", "ACTIVE", "ARCHIVED"].includes(status ?? "")
    ? (status as "LEAD" | "ACTIVE" | "ARCHIVED")
    : undefined;

  const contacts = await prisma.contact.findMany({
    where: {
      companyId,
      status: validStatus ? validStatus : { in: ["LEAD", "ACTIVE"] },
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
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
        <Link
          href="/app/contacts/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Client
        </Link>
      </div>

      {/* Search */}
      <form method="get" className="mb-4">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search clients..."
          className="w-full max-w-sm px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {validStatus && <input type="hidden" name="status" value={validStatus} />}
      </form>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {statusFilters.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/app/contacts?status=${f.value}` : "/app/contacts"}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              (validStatus ?? "") === f.value
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
          <div className="divide-y divide-gray-100">
            <div className="hidden lg:grid grid-cols-[1fr_1fr_110px_140px_40px] gap-4 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
              <span>Name</span>
              <span>Address</span>
              <span>Status</span>
              <span>Last Activity</span>
              <span></span>
            </div>
            {contacts.map((c) => (
              <Link
                key={c.id}
                href={`/app/contacts/${c.id}`}
                className="flex lg:grid lg:grid-cols-[1fr_1fr_110px_140px_40px] gap-4 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {c.firstName} {c.lastName}
                  </p>
                  {(c.phone || c.email) && (
                    <p className="text-xs text-gray-500 truncate">{c.phone || c.email}</p>
                  )}
                </div>
                <span className="hidden lg:block text-sm text-gray-500 truncate">
                  {[c.address, c.city, c.state].filter(Boolean).join(", ") || "—"}
                </span>
                <StatusChip kind="contact" status={c.status} />
                <span className="hidden lg:block text-sm text-gray-500">
                  {shortDate(c.updatedAt)}
                </span>
                <ChevronRight size={14} className="text-gray-400 shrink-0 hidden lg:block" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
