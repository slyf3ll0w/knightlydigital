import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, MapPin, CalendarDays, User, FileText, Receipt, Camera } from "lucide-react";
import JobDetailClient from "./JobDetailClient";
import NoteForm from "./NoteForm";

const statusColors: Record<string, string> = {
  LEAD: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  COMPLETE: "bg-teal-100 text-teal-700",
  INVOICED: "bg-violet-100 text-violet-700",
  PAID: "bg-green-100 text-green-700",
};

const STATUS_FLOW: Record<string, string | null> = {
  LEAD: "SCHEDULED",
  SCHEDULED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETE",
  COMPLETE: "INVOICED",
  INVOICED: "PAID",
  PAID: null,
};

const STATUS_LABELS: Record<string, string> = {
  LEAD: "Lead",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  INVOICED: "Invoiced",
  PAID: "Paid",
};

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { id } = await params;

  const job = await prisma.job.findFirst({
    where: { id, companyId },
    include: {
      contact: true,
      assignments: { include: { user: true } },
      notes: { include: { user: true }, orderBy: { createdAt: "asc" } },
      photos: { orderBy: { createdAt: "asc" } },
      quote: { include: { lineItems: true } },
      invoice: { include: { lineItems: true } },
    },
  });

  if (!job) notFound();

  const nextStatus = STATUS_FLOW[job.status];

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <Link href="/app/jobs" className="text-gray-400 hover:text-gray-600 mt-1 shrink-0">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-xs text-gray-400 font-medium">#{job.jobNumber}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${statusColors[job.status]}`}>
              {STATUS_LABELS[job.status]}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">{job.title}</h1>
          <Link
            href={`/app/contacts/${job.contact.id}`}
            className="text-sm text-gray-500 hover:text-green-600"
          >
            {job.contact.firstName} {job.contact.lastName}
          </Link>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {nextStatus && (
            <JobDetailClient jobId={job.id} nextStatus={nextStatus} nextLabel={STATUS_LABELS[nextStatus]} />
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Job details */}
          <div className="bg-white border border-gray-200 rounded-lg p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Details</h2>
            <div className="space-y-3">
              {job.scheduledAt && (
                <div className="flex items-start gap-3">
                  <CalendarDays size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-800">
                      {new Date(job.scheduledAt).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                      {" "}
                      {new Date(job.scheduledAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {job.scheduledEnd && ` – ${new Date(job.scheduledEnd).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                    </p>
                  </div>
                </div>
              )}
              {job.address && (
                <div className="flex items-start gap-3">
                  <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-800">{job.address}</p>
                </div>
              )}
              {job.assignments.length > 0 && (
                <div className="flex items-start gap-3">
                  <User size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-800">
                    {job.assignments.map((a) => a.user.name).join(", ")}
                  </p>
                </div>
              )}
              {job.description && (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</p>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Notes &amp; Activity
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {job.notes.map((note) => (
                <div key={note.id} className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                    {note.user.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold text-gray-700">{note.user.name}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(note.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.body}</p>
                  </div>
                </div>
              ))}
              {/* Note input */}
              <NoteForm jobId={job.id} />
            </div>
          </div>

          {/* Photos */}
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Photos
              </h2>
              <button className="flex items-center gap-1 text-xs text-green-600 hover:underline font-medium">
                <Camera size={12} />
                Add photo
              </button>
            </div>
            {job.photos.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Camera size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-xs text-gray-400">No photos attached yet</p>
              </div>
            ) : (
              <div className="p-4 grid grid-cols-3 gap-2">
                {job.photos.map((photo) => (
                  <a
                    key={photo.id}
                    href={photo.url}
                    target="_blank"
                    rel="noreferrer"
                    className="aspect-square rounded overflow-hidden bg-gray-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={photo.caption ?? "Job photo"}
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Quote */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Quote</h2>
              {!job.quote && (
                <Link
                  href={`/app/quotes/new?jobId=${job.id}`}
                  className="text-xs text-green-600 hover:underline font-medium"
                >
                  + Create
                </Link>
              )}
            </div>
            {job.quote ? (
              <Link href={`/app/quotes/${job.quote.id}`} className="block hover:opacity-80">
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-violet-500" />
                  <span className="text-sm font-medium text-gray-800">
                    Quote #{job.quote.quoteNumber}
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  ${Number(job.quote.total).toFixed(2)}
                </p>
                <span className="text-xs text-gray-400">{job.quote.status}</span>
              </Link>
            ) : (
              <p className="text-xs text-gray-400">No quote yet</p>
            )}
          </div>

          {/* Invoice */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Invoice</h2>
              {!job.invoice && job.status === "COMPLETE" && (
                <Link
                  href={`/app/invoices/new?jobId=${job.id}`}
                  className="text-xs text-green-600 hover:underline font-medium"
                >
                  + Create
                </Link>
              )}
            </div>
            {job.invoice ? (
              <Link href={`/app/invoices/${job.invoice.id}`} className="block hover:opacity-80">
                <div className="flex items-center gap-2">
                  <Receipt size={14} className="text-green-600" />
                  <span className="text-sm font-medium text-gray-800">
                    Invoice #{job.invoice.invoiceNumber}
                  </span>
                </div>
                <p className="text-lg font-bold text-gray-900 mt-1">
                  ${Number(job.invoice.total).toFixed(2)}
                </p>
                <span className="text-xs text-gray-400">{job.invoice.status}</span>
              </Link>
            ) : (
              <p className="text-xs text-gray-400">
                {job.status === "COMPLETE"
                  ? "Ready to invoice"
                  : "Complete the job first"}
              </p>
            )}
          </div>

          {/* Customer */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Customer</h2>
            <Link href={`/app/contacts/${job.contact.id}`} className="block hover:opacity-80">
              <p className="text-sm font-semibold text-gray-900">
                {job.contact.firstName} {job.contact.lastName}
              </p>
              {job.contact.phone && (
                <p className="text-xs text-gray-500 mt-1">{job.contact.phone}</p>
              )}
              {job.contact.email && (
                <p className="text-xs text-gray-500">{job.contact.email}</p>
              )}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

