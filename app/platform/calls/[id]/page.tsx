import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import { notFound } from "next/navigation";
import { Briefcase, CalendarClock, FileText, Mail, MapPin, Phone, Receipt, UserRound } from "lucide-react";
import BackLink from "@/components/BackLink";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell } from "@/lib/permissions";
import { fmtDateTime, fmtPhone, fmtTime } from "@/lib/format";
import { money } from "@/lib/statuses";
import { resolveCallContacts } from "@/lib/voice";
import { loadCallEvents, type CallEvent } from "@/lib/call-events";
import CallRow, { EVENT_ICON, standingWord } from "@/components/CallRow";
import CallsLive from "@/components/CallsLive";
import CallScreenLive from "./CallScreenLive";
import CallActions from "./CallActions";
import CallNotes, { type AtlasForNotes } from "./CallNotes";
import type { AtlasNotesState } from "@/lib/call-notes";
import { ATLAS_ACCESS_SELECT, atlasAccess } from "@/lib/assistant-access";
import { aiEnabled } from "@/lib/ai";

/**
 * The call screen: one call, and the person on the other end of it. Opened
 * from the floating call card while talking, from a row on /app/calls
 * afterwards, or straight from the keypad when a call is placed. The top
 * card is live (./CallScreenLive.tsx: timer, mute, hold, touch-tones, hang
 * up when the call is in this browser; the row's status otherwise). Below
 * it the things you do while they're on the line (./CallActions.tsx): save
 * an unknown caller as a lead or client, turn a lead into a client, start
 * a quote, appointment, job or invoice for them — then what already got
 * done on this call (lib/call-events.ts), what's open with them, and the
 * earlier calls.
 */

const contactSelect = {
  id: true,
  firstName: true,
  lastName: true,
  status: true,
  phone: true,
  email: true,
  companyName: true,
  address: true,
  city: true,
  state: true,
  zip: true,
} as const;

const rowSelect = {
  id: true,
  direction: true,
  status: true,
  customerNumber: true,
  durationSec: true,
  voicemailSec: true,
  voicemailRecordingId: true,
  seenAt: true,
  createdAt: true,
  contact: { select: { id: true, firstName: true, lastName: true, status: true } },
  user: { select: { name: true } },
  via: true,
  answeredBy: { select: { name: true } },
} as const;

export default async function CallScreenPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor((a) => canSell(a.role));
  const { id } = await params;
  const companyId = actor.companyId;

  const [call, company] = await Promise.all([
    prisma.call.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        direction: true,
        status: true,
        customerNumber: true,
        customerDigits: true,
        durationSec: true,
        voicemailSec: true,
        voicemailRecordingId: true,
        seenAt: true,
        createdAt: true,
        answeredAt: true,
        endedAt: true,
        via: true,
        notes: true,
        transcript: true,
        atlasNotes: true,
        atlasNotesState: true,
        atlasNotesError: true,
        atlasNotesTokens: true,
        contact: { select: contactSelect },
        user: { select: { name: true } },
        answeredBy: { select: { name: true } },
      },
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { timezone: true, lineVoiceAppAt: true, lineNumber: true, assistantName: true, ...ATLAS_ACCESS_SELECT },
    }),
  ]);
  if (!call) notFound();

  // Atlas on the notes card (CallNotes.tsx): the same gate as the drawer.
  const access = company && aiEnabled() ? atlasAccess(company) : null;
  const atlasName = company?.assistantName || "Atlas";
  const atlas: AtlasForNotes =
    !access || access.level === "off"
      ? { name: atlasName, mode: "off", reason: null }
      : access.level === "locked"
        ? {
            name: atlasName,
            mode: "locked",
            reason: `${atlasName} has used this ${access.reason === "plan-spent" ? "period's" : "month's"} tokens — the meter refills on ${new Date(access.resetsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.`,
          }
        : { name: atlasName, mode: "on", reason: null };

  // The number has been saved as someone since this call: show them, and link the row.
  let contact = call.contact;
  if (!contact && call.customerDigits) {
    const hit = (await resolveCallContacts(companyId, [call.customerDigits]).catch(() => new Map())).get(call.customerDigits);
    if (hit) contact = await prisma.contact.findUnique({ where: { id: hit.id }, select: contactSelect });
  }

  const now = new Date();
  const tz = company?.timezone ?? "America/Chicago";
  const routed = Boolean(company?.lineNumber && !company.lineNumber.startsWith("pending:") && company.lineVoiceAppAt);
  const terminal = !["RINGING", "IN_PROGRESS"].includes(call.status);
  if (terminal && !call.seenAt) await prisma.call.updateMany({ where: { id: call.id, seenAt: null }, data: { seenAt: now } }).catch(() => {});

  const [events, earlier, quotes, appointments, jobs, invoices] = contact
    ? await Promise.all([
        loadCallEvents(companyId, [{ id: call.id, contactId: contact.id, createdAt: call.createdAt, endedAt: call.endedAt }], now).catch(() => new Map<string, CallEvent[]>()),
        prisma.call.findMany({ where: { companyId, contactId: contact.id, id: { not: call.id } }, orderBy: { createdAt: "desc" }, take: 5, select: rowSelect }),
        prisma.quote.findMany({
          where: { companyId, contactId: contact.id, status: { in: ["DRAFT", "AWAITING_RESPONSE", "CHANGES_REQUESTED"] } },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, quoteNumber: true, title: true, status: true, total: true },
        }),
        prisma.appointment.findMany({
          where: { companyId, contactId: contact.id, status: "SCHEDULED", scheduledAt: { gte: new Date(now.getTime() - 3_600_000) } },
          orderBy: { scheduledAt: "asc" },
          take: 3,
          select: { id: true, title: true, scheduledAt: true },
        }),
        prisma.job.findMany({
          where: { companyId, contactId: contact.id, status: { in: ["ACTIVE", "REQUIRES_INVOICING"] } },
          orderBy: [{ scheduledAt: "asc" }],
          take: 3,
          select: { id: true, title: true, scheduledAt: true, status: true },
        }),
        prisma.invoice.findMany({
          where: { companyId, contactId: contact.id, status: { in: ["DRAFT", "AWAITING_PAYMENT", "PAST_DUE"] } },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, invoiceNumber: true, status: true, total: true },
        }),
      ])
    : [new Map<string, CallEvent[]>(), [], [], [], [], []];
  const onThisCall = events.get(call.id) ?? [];

  const name = contact ? `${contact.firstName} ${contact.lastName}`.trim() || contact.companyName || "" : "";
  const number = fmtPhone(call.customerNumber);
  const label = name || number || "Unknown caller";
  const firstName = contact?.firstName || name.split(" ")[0] || "them";
  const first = (n: string) => n.split(" ")[0];
  const who =
    call.direction === "OUTBOUND" && call.user
      ? `${first(call.user.name)}${call.via === "app" ? " in the app" : " from the cell"}`
      : call.direction === "INBOUND" && call.answeredBy
        ? `${first(call.answeredBy.name)} in the app`
        : call.direction === "INBOUND" && call.status === "COMPLETED"
          ? "on the cell"
          : "";
  const addressLine = contact ? [contact.address, [contact.city, contact.state].filter(Boolean).join(", "), contact.zip].filter(Boolean).join(" · ") : "";
  const openCount = quotes.length + appointments.length + jobs.length + invoices.length;

  return (
    <div className="mx-auto max-w-2xl p-4 lg:p-8">
      {!terminal && <CallsLive />}
      <BackLink href="/app/calls" className="mb-4" />

      <CallScreenLive
        callId={call.id}
        direction={call.direction}
        status={call.status}
        label={label}
        standing={standingWord(contact?.status)}
        number={name ? number : ""}
        customerNumber={call.customerNumber}
        contactId={contact?.id ?? null}
        answeredAt={call.answeredAt?.toISOString() ?? null}
        durationSec={call.durationSec}
        voicemailSec={call.voicemailSec}
        voicemailRecordingId={call.voicemailRecordingId}
        who={who}
        placedAt={fmtDateTime(call.createdAt, tz)}
        canCall={routed}
        via={call.via === "app" ? "app" : call.via === "cell" ? "cell" : null}
      />

      <CallActions
        callId={call.id}
        customerNumber={call.customerNumber}
        contact={contact ? { id: contact.id, status: contact.status, name: label } : null}
      />

      <CallNotes
        callId={call.id}
        atlas={atlas}
        initial={{
          status: call.status,
          notes: call.notes,
          transcript: call.transcript,
          atlasNotes: call.atlasNotes,
          contactId: contact?.id ?? null,
          atlasNotesState: (call.atlasNotesState as AtlasNotesState | null) ?? null,
          atlasNotesError: call.atlasNotesError,
          atlasNotesTokens: call.atlasNotesTokens,
        }}
      />

      {onThisCall.length > 0 && (
        <section className="card-ledger mt-4 p-4 sm:p-5">
          <SectionHeader title="On this call" />
          <ul className="mt-2 divide-y divide-gray-100">
            {onThisCall.map((e) => {
              const Icon = EVENT_ICON[e.kind];
              return (
                <li key={`${e.kind}-${e.href}`} className="flex items-center gap-3 py-2 text-sm">
                  <Icon size={15} className="shrink-0 text-gray-500" />
                  <Link href={e.href} className="font-medium text-gray-800 hover:underline">
                    {e.label}
                  </Link>
                  <span className="numeral-ledger ml-auto text-xs tabular-nums text-gray-400">{fmtTime(e.at, tz)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {contact && (
        <section className="card-ledger mt-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <SectionHeader title={`About ${firstName}`} />
            <Link href={`/app/contacts/${contact.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline">
              <UserRound size={12} /> Open profile
            </Link>
          </div>
          <dl className="mt-2 space-y-1.5 text-sm text-gray-700">
            <div className="flex items-center gap-2.5">
              <Phone size={14} className="shrink-0 text-gray-400" />
              <dd className="numeral-ledger">{fmtPhone(contact.phone) || number || "No number on file"}</dd>
            </div>
            {contact.email && (
              <div className="flex items-center gap-2.5">
                <Mail size={14} className="shrink-0 text-gray-400" />
                <dd className="truncate">{contact.email}</dd>
              </div>
            )}
            {addressLine && (
              <div className="flex items-center gap-2.5">
                <MapPin size={14} className="shrink-0 text-gray-400" />
                <dd className="truncate">{addressLine}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      {openCount > 0 && (
        <section className="card-ledger mt-4 p-4 sm:p-5">
          <SectionHeader title={`Open with ${firstName}`} />
          <ul className="mt-2 divide-y divide-gray-100">
            {quotes.map((q) => (
              <OpenItem key={q.id} href={`/app/quotes/${q.id}`} icon={FileText} label={q.title || `Quote #${q.quoteNumber}`} right={money(q.total)} sub={q.status === "AWAITING_RESPONSE" ? "waiting on them" : q.status === "CHANGES_REQUESTED" ? "changes requested" : "draft"} />
            ))}
            {appointments.map((a) => (
              <OpenItem key={a.id} href={`/app/appointments/${a.id}`} icon={CalendarClock} label={a.title} right={fmtDateTime(a.scheduledAt, tz)} />
            ))}
            {jobs.map((j) => (
              <OpenItem key={j.id} href={`/app/jobs/${j.id}`} icon={Briefcase} label={j.title} right={j.scheduledAt ? fmtDateTime(j.scheduledAt, tz) : "unscheduled"} sub={j.status === "REQUIRES_INVOICING" ? "needs an invoice" : undefined} />
            ))}
            {invoices.map((i) => (
              <OpenItem key={i.id} href={`/app/invoices/${i.id}`} icon={Receipt} label={`Invoice #${i.invoiceNumber}`} right={money(i.total)} sub={i.status === "PAST_DUE" ? "past due" : i.status === "AWAITING_PAYMENT" ? "awaiting payment" : "draft"} />
            ))}
          </ul>
        </section>
      )}

      {earlier.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-3 text-xs font-semibold text-gray-500">
            Earlier calls with {firstName}
            <span className="h-px flex-1 bg-gray-200" aria-hidden />
            <Link href={`/app/calls?contact=${contact!.id}`} className="font-normal text-gray-500 underline hover:text-gray-700">
              All
            </Link>
          </h2>
          <div className="card-ledger divide-y divide-gray-100 overflow-hidden">
            {earlier.map((c) => (
              <CallRow key={c.id} call={c} showContact={false} tz={tz} canCall={false} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OpenItem({
  href,
  icon: Icon,
  label,
  right,
  sub,
}: {
  href: string;
  icon: typeof FileText;
  label: string;
  right: string;
  sub?: string;
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-2 text-sm hover:bg-gray-50/80">
        <Icon size={15} className="shrink-0 text-gray-500" />
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-gray-800">{label}</span>
          {sub && <span className="text-gray-400"> · {sub}</span>}
        </span>
        <span className="numeral-ledger shrink-0 text-xs tabular-nums text-gray-500">{right}</span>
      </Link>
    </li>
  );
}
