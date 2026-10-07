import { fmtDateTime, fmtPhone, fmtTime } from "@/lib/format";
import { notFound } from "next/navigation";
import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import { BellRing, CalendarDays, ExternalLink, Mail, MapPin, Phone, User, Video } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePageActor, canSell, canSeeMoney, isManager, appointmentScope } from "@/lib/permissions";
import { appointmentTypeLabel } from "@/lib/statuses";
import { resolveSlotInterval } from "@/lib/scheduling";
import { earliestOpenMinutes, sanitizeBusinessHours } from "@/lib/business-hours";
import { canText } from "@/lib/sms-consent";
import { HOUR_STAGE_MS, MIN_BOOKING_AGE_MS, bookingAnchor, inSmsQuietHours, reminderOutlook } from "@/lib/reminder-stage";
import StatusChip from "@/components/StatusChip";
import { Chip } from "@/components/ds";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import JobActionRow from "@/components/JobActionRow";
import CallLink from "@/components/CallLink";
import AppointmentActions from "./AppointmentActions";

const typeIcons = { PHONE_CALL: Phone, VIDEO_CALL: Video, IN_PERSON: MapPin } as const;

/**
 * What the client has been (or will be) told automatically — so a reminder
 * that never arrived explains itself here instead of looking like a dropped
 * send. The rule is lib/reminder-stage.ts; the sweep is lib/reminders.ts.
 */
function clientReminderStatus(appt: {
  status: string;
  tentative: boolean;
  scheduledAnytime: boolean;
  remindClient: boolean;
  scheduledAt: Date;
  createdAt: Date;
  reminderDaySentAt: Date | null;
  reminderHourSentAt: Date | null;
  confirmationSentAt: Date | null;
  contact: { firstName: string; email: string | null; phone: string | null; smsOptOut: boolean; smsDisabled: boolean };
}, tz: string): string {
  const first = appt.contact.firstName;
  if (!appt.remindClient) return "Automatic client reminders are off for this appointment.";
  const textable = canText(appt.contact);
  const emailable = Boolean(appt.contact.email);
  if (!textable && !emailable) {
    return appt.contact.phone
      ? `No client reminders: texts are off for ${first} and there's no email on file.`
      : `No client reminders: ${first} has no phone or email on file.`;
  }
  const via = textable && emailable ? "text and email" : textable ? "text" : "email";
  const sent: string[] = [];
  if (appt.confirmationSentAt) sent.push(`confirmation sent ${fmtDateTime(appt.confirmationSentAt, tz)}`);
  if (appt.reminderDaySentAt) sent.push(`day-before sent ${fmtDateTime(appt.reminderDaySentAt, tz)}`);
  if (appt.reminderHourSentAt) sent.push(`hour-before sent ${fmtDateTime(appt.reminderHourSentAt, tz)}`);
  if (appt.reminderHourSentAt) return `Client reminders by ${via}: ${sent.join(" · ")}.`;

  if (appt.scheduledAnytime) return "Anytime appointments don't get automatic reminders — there's no time to be an hour ahead of.";
  if (appt.status !== "SCHEDULED") return sent.length ? `Client reminders by ${via}: ${sent.join(" · ")}.` : "No automatic client reminders went out.";
  if (appt.tentative) return "Client reminders start once the booking is confirmed.";
  // A reschedule counts as the booking time (lib/reminder-stage.ts header)
  const bookedAt = bookingAnchor(appt.createdAt, appt.reminderDaySentAt);
  const outlook = reminderOutlook({ now: new Date(), scheduledAt: appt.scheduledAt, createdAt: appt.createdAt, daySentAt: appt.reminderDaySentAt });
  if (outlook === "past") return sent.length ? `Client reminders by ${via}: ${sent.join(" · ")}.` : "No automatic client reminders went out.";
  if (outlook === "too-close")
    return "Booked less than 20 minutes before its start — too close for an automatic reminder.";
  const coming = sent.length
    ? `${sent.join(" · ")} · hour-before goes out about an hour ahead`
    : `${first} gets a reminder about an hour ahead${appt.scheduledAt.getTime() - bookedAt.getTime() > 86400000 ? ", and the day before" : ""}`;
  // Texts pause 9 PM–8 AM company-local (lib/reminder-stage.ts inSmsQuietHours).
  // When the hour-before moment lands inside that, say so here — otherwise a
  // late-evening booking looks like a dropped text.
  const hourMoment = new Date(
    Math.max(appt.scheduledAt.getTime() - HOUR_STAGE_MS, bookedAt.getTime() + MIN_BOOKING_AGE_MS)
  );
  const quiet = textable && inSmsQuietHours(hourMoment, tz);
  const quietNote = !quiet
    ? ""
    : emailable
      ? " Texts pause 9 PM–8 AM, so the hour-before reminder goes by email."
      : " Texts pause 9 PM–8 AM, and there's no email on file, so the hour-before text can't go out.";
  return `Client reminders by ${via}: ${coming}.${quietNote}`;
}

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requirePageActor((a) => canSell(a.role));

  const { id } = await params;
  const [appt, teamUsers, company] = await Promise.all([
    prisma.appointment.findFirst({
      where: { id, companyId: actor.companyId, ...appointmentScope(actor) },
      include: {
        contact: true,
        request: {
          select: {
            id: true,
            title: true,
            // Quotes produced from this request — the appointment's outcome
            quotes: {
              select: { id: true, quoteNumber: true, status: true },
              orderBy: { createdAt: "desc" },
            },
          },
        },
        assignedTo: { select: { name: true } },
        extraAssignees: { select: { userId: true, user: { select: { name: true } } } },
        // Billed straight from this appointment (no quote / job in between)
        invoices: {
          select: { id: true, invoiceNumber: true, status: true },
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    // Managers and USER (dispatchers) may reassign — same rule as the PATCH
    // route — so only they need the roster (techs can't open appointments,
    // so they're never offered)
    isManager(actor.role) || actor.role === "USER"
      ? prisma.user.findMany({
          where: { companyId: actor.companyId, isActive: true, role: { not: "TECH" } },
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { schedulingIntervalMinutes: true, businessHours: true, timezone: true },
    }),
  ]);
  if (!appt) notFound();

  // Quotes have no appointment link (Invoice.appointmentId exists, Quote has
  // none), so "a quote came out of this appointment" = any quote for this
  // client written since the appointment was booked — that is what hides
  // Create Quote once it has been used (the request's own quotes count too).
  const quotesSinceBooked = await prisma.quote.count({
    where: { companyId: actor.companyId, contactId: appt.contactId, createdAt: { gte: appt.createdAt } },
  });

  const TypeIcon = typeIcons[appt.type];
  // Read in the company's zone — the server clock is UTC
  const tz = company?.timezone ?? "America/Chicago";
  const when = appt.scheduledAnytime
    ? `${new Date(appt.scheduledAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: tz })} — Anytime`
    : `${new Date(appt.scheduledAt).toLocaleString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz })}${
        appt.scheduledEnd ? ` – ${fmtTime(appt.scheduledEnd, tz)}` : ""
      }`;

  return (
    // pb-20: phone bottom padding so the docked action pill never covers the
    // last card (same treatment as the job page)
    <div className="p-4 pb-20 lg:p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <BackLink href="/app/appointments" />
        <StatusChip kind="appointment" status={appt.status} />
        {appt.tentative && appt.status === "SCHEDULED" && (
          <Chip tone="warn">Tentative — awaiting approval</Chip>
        )}
      </div>

      {appt.tentative && appt.status === "SCHEDULED" && appt.request && (
        <div className="mb-6 rounded-lg bg-[color:var(--ds-warn-soft)] px-4 py-3 text-sm text-[color:var(--ds-ink)]">
          This time was self-scheduled online and isn&apos;t confirmed yet —{" "}
          <Link prefetch={false} href={`/app/requests/${appt.request.id}`} className="font-semibold underline">
            accept or decline the booking on the request
          </Link>
          .
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <PageTitle>{appt.title}</PageTitle>
          <p className="flex items-center gap-1.5 text-sm text-gray-500 mt-1">
            <TypeIcon size={14} className="text-[color:var(--ds-secondary)]" />
            {appointmentTypeLabel[appt.type]}
            <span className="text-gray-300">·</span>
            <Link prefetch={false} href={`/app/contacts/${appt.contact.id}`} className="text-[color:var(--ds-primary)] hover:underline">
              {appt.contact.firstName} {appt.contact.lastName}
            </Link>
          </p>
        </div>
        <AppointmentActions
          appointmentId={appt.id}
          status={appt.status}
          contactId={appt.contactId}
          contactName={`${appt.contact.firstName} ${appt.contact.lastName}`.trim()}
          requestId={appt.requestId}
          canDelete={isManager(actor.role)}
          canInvoice={canSeeMoney(actor)}
          hasQuote={(appt.request?.quotes.length ?? 0) > 0 || quotesSinceBooked > 0}
          hasInvoice={appt.invoices.length > 0}
          scheduledAt={appt.scheduledAt.toISOString()}
          scheduledEnd={appt.scheduledEnd?.toISOString() ?? null}
          scheduledAnytime={appt.scheduledAnytime}
          details={{
            title: appt.title,
            type: appt.type,
            address: appt.address ?? "",
            meetingLink: appt.meetingLink ?? "",
            notes: appt.notes ?? "",
            assigneeIds: [
              ...(appt.assignedToId ? [appt.assignedToId] : []),
              ...appt.extraAssignees.map((e) => e.userId),
            ],
          }}
          users={teamUsers}
          intervalMinutes={resolveSlotInterval({
            companyIntervalMinutes: company?.schedulingIntervalMinutes,
          })}
          dayStartMinutes={earliestOpenMinutes(sanitizeBusinessHours(company?.businessHours))}
        />
      </div>

      {/* Phone quick actions — call / text / directions, one tap from the
          appointment (the same row the job page has; directions only when
          there's somewhere to drive to) */}
      <JobActionRow
        phone={appt.contact.phone}
        contactId={appt.contact.id}
        name={`${appt.contact.firstName} ${appt.contact.lastName}`.trim()}
        address={appt.type === "IN_PERSON" ? (appt.address ?? appt.contact.address) : null}
      />

      <div className="ds-card p-5 mb-5 space-y-3">
        <div className="flex items-start gap-3">
          <CalendarDays size={15} className="text-gray-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-800">{when}</p>
        </div>
        {appt.type === "IN_PERSON" && appt.address && (
          <div className="flex items-start gap-3">
            <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-800">{appt.address}</p>
          </div>
        )}
        {appt.type === "VIDEO_CALL" && appt.meetingLink && (
          <div className="flex items-start gap-3">
            <Video size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <a
              href={appt.meetingLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-[color:var(--ds-primary)] hover:underline flex items-center gap-1"
            >
              Join meeting <ExternalLink size={12} />
            </a>
          </div>
        )}
        {appt.type === "PHONE_CALL" && appt.contact.phone && (
          <div className="flex items-start gap-3">
            <Phone size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <CallLink
              phone={appt.contact.phone}
              contactId={appt.contact.id}
              name={`${appt.contact.firstName} ${appt.contact.lastName}`.trim()}
              className="text-sm text-[color:var(--ds-primary)] hover:underline"
            >
              {fmtPhone(appt.contact.phone)}
            </CallLink>
          </div>
        )}
        {appt.contact.email && (
          <div className="flex items-start gap-3">
            <Mail size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-800">{appt.contact.email}</p>
          </div>
        )}
        {(appt.assignedTo || appt.extraAssignees.length > 0) && (
          <div className="flex items-start gap-3">
            <User size={15} className="text-gray-400 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-800">
              {[appt.assignedTo?.name, ...appt.extraAssignees.map((e) => e.user.name)].filter(Boolean).join(", ")}
            </p>
          </div>
        )}
        <div className="flex items-start gap-3">
          <BellRing size={15} className="text-gray-400 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-600">{clientReminderStatus(appt, tz)}</p>
        </div>
        {appt.request && (
          <div className="pt-2 border-t border-gray-100 text-sm">
            <span className="text-xs font-medium text-gray-500 block mb-0.5">From request</span>
            <Link prefetch={false} href={`/app/requests/${appt.request.id}`} className="text-[color:var(--ds-primary)] hover:underline">
              {appt.request.title}
            </Link>
            {appt.request.quotes.length > 0 && (
              <div className="mt-2">
                <span className="text-xs font-medium text-gray-500 block mb-0.5">
                  Quoted as
                </span>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {appt.request.quotes.map((q) => (
                    <span key={q.id} className="flex items-center gap-1.5">
                      <Link
                        prefetch={false} href={`/app/quotes/${q.id}`}
                        className="text-[color:var(--ds-primary)] hover:underline"
                      >
                        Quote #{q.quoteNumber}
                      </Link>
                      <StatusChip kind="quote" status={q.status} />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {appt.invoices.length > 0 && (
          <div className="pt-2 border-t border-gray-100 text-sm">
            <span className="text-xs font-medium text-gray-500 block mb-0.5">Invoiced as</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {appt.invoices.map((inv) => (
                <span key={inv.id} className="flex items-center gap-1.5">
                  <Link prefetch={false} href={`/app/invoices/${inv.id}`} className="text-[color:var(--ds-primary)] hover:underline">
                    Invoice #{inv.invoiceNumber}
                  </Link>
                  <StatusChip kind="invoice" status={inv.status} />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {appt.notes && (
        <div className="ds-card p-5">
          <SectionHeader title="Notes" className="mb-2" />
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{appt.notes}</p>
        </div>
      )}
    </div>
  );
}
