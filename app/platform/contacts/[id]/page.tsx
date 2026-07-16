import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, contactScope, seesAllLeads, isManager } from "@/lib/permissions";
import Link from "next/link";
import { ArrowLeft, Phone, Mail, MapPin, ChevronRight, Pencil } from "lucide-react";
import { money, shortDate, type StatusKind } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import ContactStatus from "@/components/ContactStatus";
import CallTextButtons from "@/components/CallTextButtons";
import ContactCreateMenu from "./ContactCreateMenu";
import ContactActionsMenu from "./ContactActionsMenu";
import AssignLead from "./AssignLead";
import CustomFieldsCard from "./CustomFieldsCard";
import ContactNoteForm from "./ContactNoteForm";
import ContactNoteItem from "./ContactNoteItem";
import PortalAccessCard from "./PortalAccessCard";
import AddressesCard from "./AddressesCard";
import PipelineCard from "./PipelineCard";
import { getActiveFieldDefs } from "@/lib/contact-fields";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const companyId = actor.companyId;

  const { id } = await params;

  const canReassign = seesAllLeads(actor.role);

  const [contact, teamUsers] = await Promise.all([
    prisma.contact.findFirst({
      where: { id, companyId, ...contactScope(actor) },
      include: {
        requests: { orderBy: { createdAt: "desc" } },
        appointments: { orderBy: { createdAt: "desc" } },
        contracts: { orderBy: { createdAt: "desc" } },
        contactNotes: { include: { user: true }, orderBy: { createdAt: "asc" } },
        quotes: { orderBy: { createdAt: "desc" } },
        jobs: { orderBy: { createdAt: "desc" } },
        invoices: { include: { payments: true }, orderBy: { createdAt: "desc" } },
        payments: true,
        assignedTo: { select: { id: true, name: true } },
        pipelineStage: { select: { isConverted: true } },
        addresses: { orderBy: { createdAt: "asc" } },
      },
    }),
    canReassign
      ? prisma.user.findMany({
          where: { companyId, isActive: true },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  if (!contact) notFound();

  const fieldDefs = await getActiveFieldDefs(companyId);

  // Pipeline card data — only when this contact has a card on the Leads board
  const pipelineStages = contact.pipelineStageId
    ? await prisma.pipelineStage.findMany({
        where: { companyId },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      })
    : [];
  // Repeat = worked with the company before THIS pipeline run — a first-time
  // conversion sitting in Converted isn't a repeat
  const isRepeat = contact.pipelineStage?.isConverted
    ? contact.timesWon > 1
    : contact.status === "ACTIVE" || contact.timesWon > 0;

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
      kind: "request" as StatusKind,
      status: r.status as string,
      amount: null as number | null,
    })),
    ...contact.appointments.map((a) => ({
      key: `a-${a.id}`,
      href: `/app/appointments/${a.id}`,
      type: "Appointment",
      label: a.title,
      date: a.createdAt,
      kind: "appointment" as StatusKind,
      status: a.status as string,
      amount: null as number | null,
    })),
    ...contact.contracts.map((ct) => ({
      key: `ct-${ct.id}`,
      href: `/app/contracts/${ct.id}`,
      type: "Contract",
      label: ct.title,
      date: ct.createdAt,
      kind: "contract" as StatusKind,
      status: ct.status as string,
      amount: null as number | null,
    })),
    ...contact.quotes.map((q) => ({
      key: `q-${q.id}`,
      href: `/app/quotes/${q.id}`,
      type: "Quote",
      label: q.title || `Quote #${q.quoteNumber}`,
      date: q.createdAt,
      kind: "quote" as StatusKind,
      status: q.status as string,
      amount: Number(q.total),
    })),
    ...contact.jobs.map((j) => ({
      key: `j-${j.id}`,
      href: `/app/jobs/${j.id}`,
      type: "Job",
      label: `#${j.jobNumber} ${j.title}`,
      date: j.createdAt,
      kind: "job" as StatusKind,
      status: j.status as string,
      amount: null as number | null,
    })),
    ...contact.invoices.map((inv) => ({
      key: `i-${inv.id}`,
      href: `/app/invoices/${inv.id}`,
      type: "Invoice",
      label: inv.subject || `Invoice #${inv.invoiceNumber}`,
      date: inv.createdAt,
      kind: "invoice" as StatusKind,
      status: inv.status as string,
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
        <ContactStatus status={contact.status} />
        {isRepeat && contact.pipelineStageId && (
          <span className="stamp text-blue-600" title="Has worked with you before">
            Repeat
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">
            {contact.firstName} {contact.lastName}
          </h1>
          {contact.companyName && (
            <p className="text-sm text-gray-500 mt-0.5">{contact.companyName}</p>
          )}
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
        <div className="flex items-center gap-2">
          {contact.phone && <CallTextButtons phone={contact.phone} />}
          <Link
            href={`/app/contacts/${contact.id}/edit`}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold rounded-full transition-colors"
          >
            <Pencil size={14} />
            Edit
          </Link>
          <ContactActionsMenu
            contactId={contact.id}
            contactName={`${contact.firstName} ${contact.lastName}`.trim()}
            status={contact.status}
            canDelete={isManager(actor.role)}
            counts={{
              requests: contact.requests.length,
              appointments: contact.appointments.length,
              quotes: contact.quotes.length,
              jobs: contact.jobs.length,
              invoices: contact.invoices.length,
              payments: contact.payments.length,
            }}
          />
          <ContactCreateMenu contactId={contact.id} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main: work overview */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card-ledger overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900 text-sm">Work overview</h2>
            </div>
            {workRows.length === 0 ? (
              <p className="px-4 py-10 text-sm text-gray-400 text-center">
                No work yet — use Create to add a request, quote, or job.
              </p>
            ) : (
              <div className="divide-y divide-gray-50">
                <div className="hidden lg:grid grid-cols-[90px_1fr_110px_140px_90px_30px] gap-3 px-4 py-2 text-[11px] font-semibold text-gray-600 uppercase tracking-wider bg-gray-50">
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
                    className="flex lg:grid lg:grid-cols-[90px_1fr_110px_140px_90px_30px] gap-3 items-center px-4 py-2.5 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                  >
                    <span className="text-xs font-semibold text-gray-500">{row.type}</span>
                    <span className="text-sm font-medium text-gray-900 truncate">{row.label}</span>
                    <span className="hidden lg:block text-sm text-gray-500">
                      {shortDate(row.date)}
                    </span>
                    <StatusChip kind={row.kind} status={row.status} />
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
          <div className="card-ledger p-4">
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

          <AddressesCard
            contactId={contact.id}
            primary={
              [contact.address, contact.city, contact.state, contact.zip]
                .filter(Boolean)
                .join(", ") || null
            }
            addresses={contact.addresses.map((a) => ({
              id: a.id,
              label: a.label,
              address: a.address,
              city: a.city,
              state: a.state,
              zip: a.zip,
            }))}
          />

          {/* Notes & activity (same pattern as job notes) */}
          <div className="card-ledger">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Notes &amp; Activity
              </h2>
            </div>
            <div className="p-4 space-y-3">
              {contact.contactNotes.map((note) => (
                <ContactNoteItem
                  key={note.id}
                  contactId={contact.id}
                  note={{
                    id: note.id,
                    body: note.body,
                    userName: note.user.name,
                    createdAtLabel: note.createdAt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    }),
                  }}
                  canEdit={note.userId === actor.id}
                  canDelete={note.userId === actor.id || isManager(actor.role)}
                />
              ))}
              <ContactNoteForm contactId={contact.id} />
            </div>
          </div>
        </div>

        {/* Rail: overview + hub link */}
        <div className="space-y-4">
          {contact.pipelineStageId && pipelineStages.length > 0 && (
            <PipelineCard
              contactId={contact.id}
              contactName={`${contact.firstName} ${contact.lastName}`.trim()}
              stages={pipelineStages}
              currentStageId={contact.pipelineStageId}
              daysInStage={Math.floor(
                (Date.now() - (contact.stageChangedAt ?? contact.createdAt).getTime()) / 86400000
              )}
              isLead={contact.status === "LEAD"}
            />
          )}
          <div className="card-ledger p-4">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Assigned to
            </h2>
            {canReassign ? (
              <AssignLead
                contactId={contact.id}
                assignedToId={contact.assignedTo?.id ?? ""}
                users={teamUsers}
              />
            ) : (
              <p className="text-sm text-gray-800">{contact.assignedTo?.name ?? "Unassigned"}</p>
            )}
          </div>

          <CustomFieldsCard
            contactId={contact.id}
            defs={fieldDefs}
            values={(contact.customFields as Record<string, string>) ?? {}}
          />

          <div className="card-ledger p-4">
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

          <PortalAccessCard contactId={contact.id} hubUrl={hubUrl} hasEmail={!!contact.email} />
        </div>
      </div>
    </div>
  );
}
