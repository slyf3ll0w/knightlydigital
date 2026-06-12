import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, viaContactScope } from "@/lib/permissions";
import Link from "next/link";
import { ArrowLeft, Mail, Phone, MapPin } from "lucide-react";
import { shortDate, money } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import RequestActions from "./RequestActions";

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { id } = await params;
  const request = await prisma.request.findFirst({
    where: { id, companyId, ...viaContactScope(actor) },
    include: {
      contact: true,
      quotes: { orderBy: { createdAt: "desc" } },
      jobs: { orderBy: { createdAt: "desc" } },
      appointments: { orderBy: { scheduledAt: "asc" } },
    },
  });
  if (!request) notFound();

  const c = request.contact;

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href="/app/requests" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <StatusChip kind="request" status={request.status} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{request.title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Request #{request.requestNumber} · Requested {shortDate(request.createdAt)}
            {request.preferredDate && (
              <span className="font-medium text-blue-700">
                {" "}· Client prefers {shortDate(request.preferredDate)}
              </span>
            )}
          </p>
        </div>
        <RequestActions
          requestId={request.id}
          status={request.status}
          contactId={request.contactId}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-5">
          {/* Service details */}
          <div className="card-ledger p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Service details
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {request.details || "No details provided."}
            </p>
          </div>

          {/* Appointments (estimates / sales meetings) */}
          <div className="card-ledger p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Appointments
              </h2>
              <Link
                href={`/app/appointments/new?requestId=${request.id}${
                  request.preferredDate
                    ? `&date=${request.preferredDate.toISOString().slice(0, 10)}`
                    : ""
                }`}
                className="text-xs text-green-600 hover:underline font-medium"
              >
                + Schedule Appointment
              </Link>
            </div>
            {request.appointments.length === 0 ? (
              <p className="text-sm text-gray-500">
                No appointment booked — schedule an estimate or sales call for this request.
              </p>
            ) : (
              <div className="space-y-2">
                {request.appointments.map((a) => (
                  <Link
                    key={a.id}
                    href={`/app/appointments/${a.id}`}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-green-700 hover:underline truncate">
                      {a.title} ·{" "}
                      {a.scheduledAnytime
                        ? `${shortDate(a.scheduledAt)}, anytime`
                        : new Date(a.scheduledAt).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                    </span>
                    <StatusChip kind="appointment" status={a.status} />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Linked work */}
          {(request.quotes.length > 0 || request.jobs.length > 0) && (
            <div className="card-ledger p-5">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                Used for
              </h2>
              <div className="space-y-2">
                {request.quotes.map((q) => (
                  <Link
                    key={q.id}
                    href={`/app/quotes/${q.id}`}
                    className="flex items-center justify-between text-sm text-green-700 hover:underline"
                  >
                    <span>Quote #{q.quoteNumber}</span>
                    <span className="text-gray-500">{money(q.total)}</span>
                  </Link>
                ))}
                {request.jobs.map((j) => (
                  <Link
                    key={j.id}
                    href={`/app/jobs/${j.id}`}
                    className="flex items-center justify-between text-sm text-green-700 hover:underline"
                  >
                    <span>Job #{j.jobNumber}</span>
                    <span className="text-gray-500">{shortDate(j.scheduledAt)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Client card */}
        <div className="space-y-4">
          <div className="card-ledger p-5">
            <Link
              href={`/app/contacts/${c.id}`}
              className="text-base font-semibold text-green-700 hover:underline"
            >
              {c.firstName} {c.lastName}
            </Link>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              {c.address && (
                <p className="flex items-start gap-2">
                  <MapPin size={14} className="mt-0.5 text-gray-400 shrink-0" />
                  {c.address}
                  {c.city ? `, ${c.city}` : ""} {c.state} {c.zip}
                </p>
              )}
              {c.phone && (
                <p className="flex items-center gap-2">
                  <Phone size={14} className="text-gray-400" />
                  <a href={`tel:${c.phone}`} className="hover:underline">
                    {c.phone}
                  </a>
                </p>
              )}
              {c.email && (
                <p className="flex items-center gap-2">
                  <Mail size={14} className="text-gray-400" />
                  <a href={`mailto:${c.email}`} className="hover:underline truncate">
                    {c.email}
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
