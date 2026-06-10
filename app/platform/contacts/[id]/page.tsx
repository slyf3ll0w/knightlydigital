import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, ChevronRight, ExternalLink } from "lucide-react";
import {
  contactStatusColor,
  contactStatusLabel,
  requestStatusLabel,
  quoteStatusLabel,
  jobStatusLabel,
  invoiceStatusLabel,
  requestStatusColor,
  quoteStatusColor,
  jobStatusColor,
  invoiceStatusColor,
  money,
  shortDate,
} from "@/lib/statuses";
import ContactCreateMenu from "./ContactCreateMenu";

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
      requests: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "desc" } },
      jobs: { orderBy: { createdAt: "desc" } },
      invoices: { include: { payments: true }, orderBy: { createdAt: "desc" } },
      payments: true,
    },
  });

  if (!contact) notFound();

  const lifetimeValue = contact.payments.reduce((s, p) => s + Number(p.amount), 0);
  const currentBalance = contact.invoices
    .filter((i) => i.status !== "DRAFT")
    .reduce((s, inv) => {
      const paid = inv.payments.reduce((p, x) => p + Number(x.amount), 0);
      return s + Math.max(0, Number(inv.total) - paid);
    }, 0);

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const hubUrl = `${baseUrl}/hub/${contact.hubToken}`;

  // Unified work overview rows (Jobber's client work table)
  const workRows = [
    ...contact.requests.map((r) => ({
      key: `r-${r.id}`,
      href: `/app/requests/${r.id}`,
      type: "Request",
      label: r.title,
      date: r.createdAt,
      status: requestStatusLabel[r.status],
      statusColor: requestStatusColor[r.status],
      amount: null as number | null,
    })),
    ...contact.quotes.map((q) => ({
      key: `q-${q.id}`,
      href: `/app/quotes/${q.id}`,
      type: "Quote",
      label: q.title || `Quote #${q.quoteNumber}`,
      date: q.createdAt,
      status: quoteStatusLabel[q.status],
      statusColor: quoteStatusColor[q.status],
      amount: Number(q.total),
    })),
    ...contact.jobs.map((j) => ({
      key: `j-${j.id}`,
      href: `/app/jobs/${j.id}`,
      type: "Job",
      label: `#${j.jobNumber} ${j.title}`,
      date: j.createdAt,
      status: jobStatusLabel[j.status],
      statusColor: jobStatusColor[j.status],
      amount: null as number | null,
    })),
    ...contact.invoices.map((inv) => ({
      key: `i-${inv.id}`,
      href: `/app/invoices/${inv.id}`,
      type: "Invoice",
      label: inv.subject || `Invoice #${inv.invoiceNumber}`,
      date: inv.createdAt,
      status: invoiceStatusLabel[inv.status],
      statusColor: invoiceStatusColor[inv.status],
      amount: Number(inv.total),
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/app/contacts" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${contactStatusColor[contact.status]}`}
        >
          {contactStatusLabel[contact.status]}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">
            {contact.firstName} {contact.lastName}
          </h1>
          <div className="flex flex-wrap items-center gap-3 mt-1">
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <Phone size={13} />
                {contact.phone}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
              >
                <Mail size={13} />
                {contact.email}
              </a>
            )}
            {contact.address && (
              <span className="flex items-center gap-1 text-sm text-gray-500">
                <MapPin size={13} />
                {[contact.address, contact.city, contact.state, contact.zip]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            )}
          </div>
        </div>
        <ContactCreateMenu contactId={contact.id} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main: work overview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">Work overview</h2>
            </div>
            {workRows.length === 0 ? (
              <p className="px-4 py-10 text-sm text-gray-400 text-center">
                No work yet — use Create to add a request, quote, or job.
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                <div className="hidden lg:grid grid-cols-[90px_1fr_110px_140px_90px_30px] gap-3 px-4 py-2.5 text-xs font-medium text-gray-500 uppercase tracking-wide bg-gray-50">
                  <span>Item</span>
                  <span></span>
                  <span>Date</span>
                  <span>Status</span>
                  <span className="text-right">Amount</span>
                  <span></span>
                </div>
                {workRows.map((row) => (
                  <Link
                    key={row.key}
                    href={row.href}
                    className="flex lg:grid lg:grid-cols-[90px_1fr_110px_140px_90px_30px] gap-3 items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500">{row.type}</span>
                    <span className="text-sm font-medium text-gray-900 truncate">{row.label}</span>
                    <span className="hidden lg:block text-sm text-gray-500">
                      {shortDate(row.date)}
                    </span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded w-fit ${row.statusColor}`}
                    >
                      {row.status}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 lg:text-right">
                      {row.amount !== null ? money(row.amount) : "—"}
                    </span>
                    <ChevronRight size={13} className="text-gray-300 hidden lg:block" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Contact info */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Details
            </h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-gray-400 text-xs">Payment terms</dt>
                <dd className="text-gray-800">Net {contact.paymentTermsDays}</dd>
              </div>
              <div>
                <dt className="text-gray-400 text-xs">Lead source</dt>
                <dd className="text-gray-800">{contact.leadSource || "—"}</dd>
              </div>
              {contact.notes && (
                <div className="col-span-2">
                  <dt className="text-gray-400 text-xs">Notes</dt>
                  <dd className="text-gray-700 whitespace-pre-wrap">{contact.notes}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Rail: overview + hub link */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Overview
            </h2>
            <div className="space-y-3">
              <div>
                <p className="text-xl font-bold text-gray-900">{money(lifetimeValue)}</p>
                <p className="text-xs text-gray-500">Lifetime value</p>
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{money(currentBalance)}</p>
                <p className="text-xs text-gray-500">Current balance</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Client hub
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              The client can view quotes, approve work, and pay invoices from their hub.
            </p>
            <a
              href={hubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-green-600 hover:underline font-medium"
            >
              <ExternalLink size={13} />
              Open client hub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
