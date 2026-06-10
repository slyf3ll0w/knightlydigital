import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Users, Plus, Phone, Mail, ChevronRight } from "lucide-react";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { q } = await searchParams;

  const contacts = await prisma.contact.findMany({
    where: {
      companyId,
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
    include: {
      _count: { select: { jobs: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500">{contacts.length} customer{contacts.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/app/contacts/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          Add Contact
        </Link>
      </div>

      {/* Search */}
      <form className="mb-4">
        <input
          name="q"
          type="search"
          defaultValue={q}
          placeholder="Search by name, email, or phone..."
          className="w-full max-w-sm px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {contacts.length === 0 ? (
          <div className="py-16 text-center">
            <Users size={36} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">
              {q ? "No contacts match your search." : "No contacts yet."}
            </p>
            {!q && (
              <Link
                href="/app/contacts/new"
                className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
              >
                <Plus size={13} />
                Add your first contact
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {/* Header */}
            <div className="hidden lg:grid grid-cols-[1fr_160px_180px_80px_32px] gap-4 px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
              <span>Name</span>
              <span>Phone</span>
              <span>Email</span>
              <span>Jobs</span>
              <span></span>
            </div>
            {contacts.map((c) => (
              <Link
                key={c.id}
                href={`/app/contacts/${c.id}`}
                className="flex lg:grid lg:grid-cols-[1fr_160px_180px_80px_32px] gap-4 items-center px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {c.firstName} {c.lastName}
                  </p>
                  {c.city && (
                    <p className="text-xs text-gray-400">{c.city}{c.state ? `, ${c.state}` : ""}</p>
                  )}
                </div>
                <div className="hidden lg:flex items-center gap-1.5 text-sm text-gray-600">
                  {c.phone && (
                    <>
                      <Phone size={12} className="text-gray-400" />
                      {c.phone}
                    </>
                  )}
                </div>
                <div className="hidden lg:flex items-center gap-1.5 text-sm text-gray-600">
                  {c.email && (
                    <>
                      <Mail size={12} className="text-gray-400" />
                      <span className="truncate">{c.email}</span>
                    </>
                  )}
                </div>
                <div className="hidden lg:block text-sm text-gray-500">
                  {c._count.jobs} job{c._count.jobs !== 1 ? "s" : ""}
                </div>
                <ChevronRight size={14} className="text-gray-400 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
