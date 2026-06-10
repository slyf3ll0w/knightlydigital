import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, Plus, ChevronRight } from "lucide-react";

const statusColors: Record<string, string> = {
  LEAD: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  COMPLETE: "bg-teal-100 text-teal-700",
  INVOICED: "bg-violet-100 text-violet-700",
  PAID: "bg-green-100 text-green-700",
};

const invoiceStatusColors: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  SENT: "bg-blue-100 text-blue-700",
  PAID: "bg-green-100 text-green-700",
  OVERDUE: "bg-red-100 text-red-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, companyId },
    include: {
      jobs: {
        include: { assignments: { include: { user: true } } },
        orderBy: { createdAt: "desc" },
      },
      invoices: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "desc" } },
      servicePlans: { orderBy: { createdAt: "desc" } },
    },
  });

  if (!contact) notFound();

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Link href="/app/contacts" className="text-gray-400 hover:text-gray-600 mt-1">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            {contact.firstName} {contact.lastName}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {contact.phone && (
              <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                <Phone size={13} />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
                <Mail size={13} />
                {contact.email}
              </a>
            )}
            {contact.address && (
              <span className="flex items-center gap-1 text-sm text-gray-500">
                <MapPin size={13} />
                {[contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href={`/app/jobs/new?contactId=${contact.id}`}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
          >
            <Plus size={13} />
            New Job
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: contact info */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Contact Info
            </h2>
            <dl className="space-y-2 text-sm">
              {contact.phone && (
                <div>
                  <dt className="text-gray-400 text-xs">Phone</dt>
                  <dd className="text-gray-800">{contact.phone}</dd>
                </div>
              )}
              {contact.email && (
                <div>
                  <dt className="text-gray-400 text-xs">Email</dt>
                  <dd className="text-gray-800 break-all">{contact.email}</dd>
                </div>
              )}
              {contact.address && (
                <div>
                  <dt className="text-gray-400 text-xs">Address</dt>
                  <dd className="text-gray-800">
                    {contact.address}
                    {contact.city && <><br />{contact.city}{contact.state ? `, ${contact.state}` : ""} {contact.zip}</>}
                  </dd>
                </div>
              )}
              {contact.notes && (
                <div>
                  <dt className="text-gray-400 text-xs">Notes</dt>
                  <dd className="text-gray-700 whitespace-pre-wrap">{contact.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Stats */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Activity
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xl font-bold text-gray-900">{contact.jobs.length}</p>
                <p className="text-xs text-gray-500">Jobs</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{contact.quotes.length}</p>
                <p className="text-xs text-gray-500">Quotes</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{contact.invoices.length}</p>
                <p className="text-xs text-gray-500">Invoices</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: history */}
        <div className="lg:col-span-2 space-y-4">
          {/* Jobs */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">Jobs</h2>
              <Link
                href={`/app/jobs/new?contactId=${contact.id}`}
                className="text-xs text-green-600 hover:underline font-medium"
              >
                + New
              </Link>
            </div>
            {contact.jobs.length === 0 ? (
              <p className="px-4 py-8 text-sm text-gray-400 text-center">No jobs yet</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {contact.jobs.map((job) => (
                  <Link
                    key={job.id}
                    href={`/app/jobs/${job.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        #{job.jobNumber} {job.title}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(job.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[job.status]}`}>
                      {job.status.replace("_", " ")}
                    </span>
                    <ChevronRight size={13} className="text-gray-300" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Invoices */}
          {contact.invoices.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-4 py-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">Invoices</h2>
              </div>
              <div className="divide-y divide-gray-50">
                {contact.invoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/app/invoices/${inv.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">Invoice #{inv.invoiceNumber}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(inv.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      ${Number(inv.total).toFixed(2)}
                    </p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${invoiceStatusColors[inv.status]}`}>
                      {inv.status}
                    </span>
                    <ChevronRight size={13} className="text-gray-300" />
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
