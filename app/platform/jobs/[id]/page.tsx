import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ArrowLeft, MapPin, CalendarDays, User } from "lucide-react";
import { quoteStatusLabel, money, shortDate } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import { requirePageActor, jobScope, canSeePricing, canSell, isManager } from "@/lib/permissions";
import JobActions from "./JobActions";
import NoteForm from "./NoteForm";
import ScheduleJob from "./ScheduleJob";
import AssignTeam from "./AssignTeam";
import PhotoUpload from "./PhotoUpload";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor();
  const companyId = actor.companyId;
  const showMoney = canSeePricing(actor.role); // techs see the work, not the prices
  const canEdit = isManager(actor.role) || actor.role === "USER";
  const canOpenContact = canSell(actor.role);

  const { id } = await params;

  const [job, teamUsers] = await Promise.all([
    prisma.job.findFirst({
      where: { id, companyId, ...jobScope(actor) },
      include: {
        contact: true,
        request: true,
        assignments: { include: { user: true } },
        notes: { include: { user: true }, orderBy: { createdAt: "asc" } },
        photos: { orderBy: { createdAt: "asc" } },
        lineItems: { orderBy: { sortOrder: "asc" } },
        quote: true,
        invoice: { include: { payments: true } },
      },
    }),
    canEdit
      ? prisma.user.findMany({
          where: { companyId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  if (!job) notFound();

  const lineTotal = job.lineItems.reduce((s, li) => s + Number(li.total), 0);
  const lineCost = job.lineItems.reduce(
    (s, li) => s + Number(li.unitCost ?? 0) * Number(li.quantity),
    0
  );

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Link href="/app/jobs" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <StatusChip kind="job" status={job.status} />
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">{job.title}</h1>
          {canOpenContact ? (
            <Link
              href={`/app/contacts/${job.contact.id}`}
              className="text-sm text-green-700 hover:underline"
            >
              {job.contact.firstName} {job.contact.lastName}
            </Link>
          ) : (
            <p className="text-sm text-gray-600">
              {job.contact.firstName} {job.contact.lastName}
            </p>
          )}
        </div>
        {actor.role !== "SALES" && (
          <JobActions
            jobId={job.id}
            status={job.status}
            hasInvoice={!!job.invoice}
            hasQuote={!!job.quote}
            canDelete={isManager(actor.role)}
            canEdit={canEdit}
            scheduledAt={job.scheduledAt?.toISOString() ?? null}
          />
        )}
      </div>

      {/* Header facts with backlinks */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 px-5 py-4 card-ledger mb-6 text-sm">
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Job #</span>
          <span className="text-gray-800">{job.jobNumber}</span>
        </div>
        <div>
          <span className="text-xs uppercase font-semibold text-gray-400 block">Scheduled</span>
          <ScheduleJob
            jobId={job.id}
            scheduledAt={job.scheduledAt?.toISOString() ?? null}
            scheduledEnd={job.scheduledEnd?.toISOString() ?? null}
            scheduledAnytime={job.scheduledAnytime}
          />
        </div>
        {job.quote && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">From quote</span>
            <Link href={`/app/quotes/${job.quote.id}`} className="text-green-700 hover:underline">
              Quote #{job.quote.quoteNumber} ({quoteStatusLabel[job.quote.status]})
            </Link>
          </div>
        )}
        {job.request && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">From request</span>
            <Link href={`/app/requests/${job.request.id}`} className="text-green-700 hover:underline">
              {job.request.title}
            </Link>
          </div>
        )}
        {job.closedAt && (
          <div>
            <span className="text-xs uppercase font-semibold text-gray-400 block">Closed</span>
            <span className="text-gray-800">{shortDate(job.closedAt)}</span>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Schedule + details */}
          <div className="card-ledger p-5">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Details
            </h2>
            <div className="space-y-3">
              {job.scheduledAt && (
                <div className="flex items-start gap-3">
                  <CalendarDays size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <p className="text-sm text-gray-800">
                    {new Date(job.scheduledAt).toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    {new Date(job.scheduledAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {job.scheduledEnd &&
                      ` – ${new Date(job.scheduledEnd).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`}
                  </p>
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

          {/* Line items */}
          {job.lineItems.length > 0 && (
            <div className="card-ledger overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Product / Service
                </h2>
              </div>
              <div className="px-5 py-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs uppercase text-gray-500 font-semibold">
                        Line item
                      </th>
                      <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-14">
                        Qty
                      </th>
                      {showMoney && (
                        <>
                          <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-24">
                            Unit Price
                          </th>
                          <th className="text-right py-2 text-xs uppercase text-gray-500 font-semibold w-24">
                            Total
                          </th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {job.lineItems.map((li) => (
                      <tr key={li.id}>
                        <td className="py-2.5">
                          <p className="text-gray-900 font-medium">{li.name}</p>
                          {li.description && (
                            <p className="text-gray-500 text-xs mt-0.5">{li.description}</p>
                          )}
                        </td>
                        <td className="py-2.5 text-right text-gray-600">{Number(li.quantity)}</td>
                        {showMoney && (
                          <>
                            <td className="py-2.5 text-right text-gray-600">{money(li.unitPrice)}</td>
                            <td className="py-2.5 text-right font-medium text-gray-900">
                              {money(li.total)}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {showMoney && (
                <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
                  <div className="ml-auto w-56 space-y-1 text-sm">
                    {lineCost > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total cost</span>
                        <span className="text-gray-700">{money(lineCost)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold">
                      <span className="text-gray-900">Total price</span>
                      <span className="text-gray-900">{money(lineTotal)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes */}
          <div className="card-ledger">
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
              <NoteForm jobId={job.id} />
            </div>
          </div>

          {/* Photos */}
          <div className="card-ledger">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Photos</h2>
            </div>
            <PhotoUpload
              jobId={job.id}
              photos={job.photos.map((p) => ({
                id: p.id,
                url: p.url,
                caption: p.caption,
                type: p.type,
              }))}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Team assignment — shown even for a team of one: assignments drive
              tech visibility, the schedule filter, AND booking availability
              (an unassigned job doesn't block anyone's slots individually) */}
          {canEdit && teamUsers.length >= 1 && (
            <AssignTeam
              jobId={job.id}
              users={teamUsers}
              assignedIds={job.assignments.map((a) => a.userId)}
            />
          )}

          {/* Billing */}
          {showMoney && (
          <div className="card-ledger p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Billing</h2>
              {!job.invoice && (
                <Link
                  href={`/app/invoices/new?jobId=${job.id}`}
                  className="text-xs text-green-600 hover:underline font-medium"
                >
                  + Create Invoice
                </Link>
              )}
            </div>
            {job.invoice ? (
              <Link href={`/app/invoices/${job.invoice.id}`} className="block hover:opacity-80">
                <p className="text-sm font-medium text-gray-800">
                  Invoice #{job.invoice.invoiceNumber}
                </p>
                <p className="text-lg font-bold text-gray-900 mt-1">{money(job.invoice.total)}</p>
                <StatusChip kind="invoice" status={job.invoice.status} className="mt-1" />
              </Link>
            ) : (
              <p className="text-xs text-gray-400">
                {job.status === "REQUIRES_INVOICING"
                  ? "This job is waiting to be invoiced."
                  : "No invoice yet."}
              </p>
            )}
          </div>
          )}

          {/* Profit (when costs are tracked) */}
          {showMoney && lineCost > 0 && (
            <div className="card-ledger p-4">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Profit margin
              </h2>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Revenue</span>
                  <span className="text-gray-800">{money(lineTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Line item cost</span>
                  <span className="text-gray-800">-{money(lineCost)}</span>
                </div>
                <div className="flex justify-between font-semibold border-t border-gray-100 pt-1.5">
                  <span className="text-gray-900">Profit</span>
                  <span className={lineTotal - lineCost >= 0 ? "text-green-700" : "text-red-600"}>
                    {money(lineTotal - lineCost)}
                    {lineTotal > 0 &&
                      ` (${Math.round(((lineTotal - lineCost) / lineTotal) * 100)}%)`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Client */}
          <div className="card-ledger p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Client
            </h2>
            {(() => {
              const card = (
                <>
                  <p className="text-sm font-semibold text-gray-900">
                    {job.contact.firstName} {job.contact.lastName}
                  </p>
                  {job.contact.phone && (
                    <p className="text-xs text-gray-500 mt-1">{job.contact.phone}</p>
                  )}
                  {job.contact.email && <p className="text-xs text-gray-500">{job.contact.email}</p>}
                  {job.contact.address && (
                    <p className="text-xs text-gray-500">{job.contact.address}</p>
                  )}
                </>
              );
              return canOpenContact ? (
                <Link href={`/app/contacts/${job.contact.id}`} className="block hover:opacity-80">
                  {card}
                </Link>
              ) : (
                <div>{card}</div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
