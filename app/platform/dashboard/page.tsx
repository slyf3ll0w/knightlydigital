import { prisma } from "@/lib/db";
import Link from "next/link";
import {
  Inbox,
  FileText,
  Briefcase,
  Receipt,
  ChevronRight,
  Phone,
  Video,
  MapPin,
  CheckCircle2,
  CalendarPlus,
  CalendarCheck,
  LifeBuoy,
  Megaphone,
  Timer,
  Repeat,
  Navigation,
  CalendarDays,
  Plus,
} from "lucide-react";
import { money, appointmentTypeLabel } from "@/lib/statuses";
import { invoiceBalance } from "@/lib/payments";
import { SECTION_HUES } from "@/lib/section-colors";
import { formatDuration, mapsHref, mapsSearchHref } from "@/lib/time-entries";
import { renderMessageTemplate, DEFAULT_ON_MY_WAY_TEMPLATE } from "@/lib/messaging";
import { arrivalTimeLabel, resolveArrivalWindowMinutes } from "@/lib/arrival-window";
import { startOfDayIn, startOfMonthIn, startOfWeekIn, zonedMidnight, zonedParts } from "@/lib/timezone";
import CountUp from "@/components/CountUp";
import DashboardSetupCard from "./DashboardSetupCard";
import UpNextActions from "./UpNextActions";
import AtlasHomeButton from "@/components/AtlasHomeButton";
import SwipeRowContact from "@/components/SwipeRowContact";
import { PushNudge } from "@/components/PushNotifications";
import { ActionLink, Button, Card, Chip, DsPage, Hint, ListRow, PageHeader, SectionTitle, Stat } from "@/components/ds";
import {
  requirePageActor,
  isManager,
  canSell,
  canSeeMoney,
  canSeePricing,
  viaContactScope,
  jobScope,
  appointmentScope,
} from "@/lib/permissions";

const apptIcons = { PHONE_CALL: Phone, VIDEO_CALL: Video, IN_PERSON: MapPin } as const;

/** Tiny daily-revenue bar chart — pure SVG, renders on the server. */
function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  const w = 100;
  const gap = 1.5;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg
      viewBox={`0 0 ${w} 24`}
      className={`mt-4 h-8 w-full ${className}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {values.map((v, i) => {
        const h = v > 0 ? Math.max((v / max) * 22, 2) : 1;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={24 - h}
            width={bw}
            height={h}
            rx={0.75}
            fill={i === values.length - 1 ? "var(--ds-secondary)" : "var(--ds-primary)"}
            opacity={v > 0 ? (i === values.length - 1 ? 1 : 0.8) : 0.15}
          />
        );
      })}
    </svg>
  );
}

export default async function DashboardPage() {
  const actor = await requirePageActor();
  const companyId = actor.companyId;

  // Role lens: what this person's dashboard talks about
  const sell = canSell(actor.role);
  const seeMoney = canSeeMoney(actor);
  const seePrices = canSeePricing(actor.role);
  const seePerformance = isManager(actor.role) || actor.role === "USER";
  const leadScope = viaContactScope(actor);
  const jScope = jobScope(actor);

  // "Today", "this week", "this month" and the greeting are the company's
  // calendar, not the server's: Railway runs on UTC, so a Central owner at
  // 8 pm was already seeing tomorrow's visits and "Good afternoon" at 11 am.
  const tz =
    (await prisma.company.findUnique({ where: { id: companyId }, select: { timezone: true } }))
      ?.timezone ?? "America/Chicago";
  const now = new Date();
  const local = zonedParts(tz, now);
  const startOfDay = startOfDayIn(tz, now);
  const endOfDay = zonedMidnight(tz, local.y, local.m, local.d + 1);
  const startOfMonth = startOfMonthIn(tz, now);
  const startOfWeek = startOfWeekIn(tz, now);
  const endOfWeek = zonedMidnight(tz, local.y, local.m, local.d - local.weekday + 7);

  const [
    newRequests,
    needsApprovalRequests,
    approvedQuotes,
    draftQuotes,
    changesRequestedQuotes,
    requiresInvoicingJobs,
    unscheduledJobs,
    draftInvoices,
    pastDueInvoices,
    todayVisits,
    todayAppointments,
    receivables,
    upcomingJobsWeek,
    monthPayments,
    setupCompany,
    onClock,
    readyToBill,
    heroCompany,
    myOpenEntry,
  ] = await Promise.all([
    prisma.request.count({ where: { companyId, ...leadScope, status: "NEW" } }),
    prisma.request.count({ where: { companyId, ...leadScope, status: "NEEDS_APPROVAL" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "APPROVED" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "DRAFT" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "CHANGES_REQUESTED" } }),
    prisma.job.count({ where: { companyId, ...jScope, status: "REQUIRES_INVOICING" } }),
    prisma.job.count({ where: { companyId, ...jScope, status: "ACTIVE", scheduledAt: null } }),
    prisma.invoice.count({ where: { companyId, ...leadScope, status: "DRAFT" } }),
    prisma.invoice.count({ where: { companyId, ...leadScope, status: "PAST_DUE" } }),
    prisma.job.findMany({
      where: { companyId, ...jScope, scheduledAt: { gte: startOfDay, lt: endOfDay } },
      include: { contact: true, lineItems: true, assignments: { include: { user: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    sell
      ? prisma.appointment.findMany({
          where: {
            companyId,
            ...appointmentScope(actor),
            status: "SCHEDULED",
            scheduledAt: { gte: startOfDay, lt: endOfDay },
          },
          include: { contact: true, assignedTo: { select: { name: true } } },
          orderBy: { scheduledAt: "asc" },
        })
      : Promise.resolve([]),
    seePerformance
      ? prisma.invoice.findMany({
          where: { companyId, status: { in: ["AWAITING_PAYMENT", "PAST_DUE"] } },
          include: { payments: true },
        })
      : Promise.resolve([]),
    seePerformance
      ? prisma.job.findMany({
          where: { companyId, status: "ACTIVE", scheduledAt: { gte: startOfWeek, lt: endOfWeek } },
          include: { lineItems: true },
        })
      : Promise.resolve([]),
    seePerformance
      ? prisma.payment.findMany({
          where: { companyId, paidAt: { gte: startOfMonth } },
          select: { amount: true, paidAt: true },
        })
      : Promise.resolve([]),
    isManager(actor.role)
      ? prisma.company.findUnique({ where: { id: companyId }, select: { setupWizardAt: true } })
      : Promise.resolve(null),
    // Who's clocked in right now (owners/admins) — open time entries
    isManager(actor.role)
      ? prisma.timeEntry.findMany({
          where: { companyId, endedAt: null },
          include: {
            user: { select: { name: true } },
            job: { select: { id: true, title: true, address: true } },
          },
          orderBy: { startedAt: "asc" },
        })
      : Promise.resolve([]),
    // Completed per-visit-series work waiting in the Ready-to-bill queue
    seeMoney
      ? prisma.job.findMany({
          where: {
            companyId,
            completedAt: { not: null },
            invoice: { is: null },
            consolidatedInvoiceId: null,
            subscription: { is: { billPerVisit: true, status: { not: "CANCELLED" } } },
          },
          select: { subscription: { select: { unitPrice: true, quantity: true } } },
        })
      : Promise.resolve([]),
    // The "Up next" hero's action row needs the On-My-Way template context
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, timezone: true, onMyWayTemplate: true, arrivalWindowMinutes: true },
    }),
    // My open clock entry, wherever it is — drives the hero's clocked-in state
    prisma.timeEntry.findFirst({
      where: { userId: actor.id, endedAt: null },
      select: { id: true, startedAt: true, jobId: true },
    }),
  ]);
  const showSetupCard = isManager(actor.role) && setupCompany?.setupWizardAt == null;

  const receivableTotal = receivables.reduce((s, inv) => s + invoiceBalance(inv), 0);
  const receivableClients = new Set(receivables.map((i) => i.contactId).filter(Boolean)).size;
  const weekRevenue = upcomingJobsWeek.reduce(
    (s, j) => s + j.lineItems.reduce((t, li) => t + Number(li.total), 0),
    0
  );
  // Daily revenue buckets for the sparkline (1st of month → today)
  const monthRevenue = monthPayments.reduce((s, p) => s + Number(p.amount), 0);
  const dailyRevenue = Array.from({ length: local.d }, () => 0);
  for (const p of monthPayments) {
    const day = zonedParts(tz, new Date(p.paidAt)).d - 1;
    if (day >= 0 && day < dailyRevenue.length) dailyRevenue[day] += Number(p.amount);
  }

  // "Needs you" — the same lifecycle counts, but reframed as a prioritized
  // to-do list with an action verb. Only items with something waiting render,
  // so a quiet day reads calm instead of showing a wall of zeros. Urgent
  // (money overdue) sorts first.
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const readyToBillTotal = readyToBill.reduce(
    (s, j) => s + (j.subscription ? Number(j.subscription.unitPrice) * Number(j.subscription.quantity) : 0),
    0
  );
  const needs = [
    {
      // Billing the queue is POST /api/app/subscriptions/bill-ready — manager-only
      show: isManager(actor.role),
      count: readyToBill.length,
      icon: Repeat,
      hue: SECTION_HUES.subscriptions,
      title: plural(readyToBill.length, "Visit ready to bill", "Visits ready to bill"),
      action: `Bill ${money(readyToBillTotal)} in one click`,
      href: "/app/subscriptions",
      urgent: false,
    },
    {
      show: sell,
      count: needsApprovalRequests,
      icon: CalendarCheck,
      hue: SECTION_HUES.requests,
      title: plural(needsApprovalRequests, "Booking to approve", "Bookings to approve"),
      action: "Accept or decline",
      href: "/app/requests?status=NEEDS_APPROVAL",
      urgent: true,
    },
    {
      show: seeMoney,
      count: pastDueInvoices,
      icon: Receipt,
      hue: SECTION_HUES.invoices,
      title: plural(pastDueInvoices, "Past-due invoice", "Past-due invoices"),
      action: "Send a reminder",
      href: "/app/invoices?status=PAST_DUE",
      urgent: true,
    },
    {
      show: sell,
      count: newRequests,
      icon: Inbox,
      hue: SECTION_HUES.requests,
      title: plural(newRequests, "New request", "New requests"),
      action: "Review & send a quote",
      href: "/app/requests?status=NEW",
      urgent: false,
    },
    {
      show: sell,
      count: changesRequestedQuotes,
      icon: FileText,
      hue: SECTION_HUES.quotes,
      title: "Changes requested",
      action: "Update the quote",
      href: "/app/quotes?status=CHANGES_REQUESTED",
      urgent: false,
    },
    {
      show: sell,
      count: approvedQuotes,
      icon: FileText,
      hue: SECTION_HUES.quotes,
      title: plural(approvedQuotes, "Approved quote", "Approved quotes"),
      action: "Convert to a job",
      href: "/app/quotes?status=APPROVED",
      urgent: false,
    },
    {
      show: seeMoney,
      count: requiresInvoicingJobs,
      icon: Briefcase,
      hue: SECTION_HUES.jobs,
      title: plural(requiresInvoicingJobs, "Job ready to invoice", "Jobs ready to invoice"),
      action: "Send the invoice",
      href: "/app/jobs?status=REQUIRES_INVOICING",
      urgent: false,
    },
    {
      show: true,
      count: unscheduledJobs,
      icon: CalendarPlus,
      hue: SECTION_HUES.schedule,
      title: plural(unscheduledJobs, "Unscheduled job", "Unscheduled jobs"),
      action: "Put it on the calendar",
      href: "/app/jobs?status=ACTIVE&unscheduled=1",
      urgent: false,
    },
    {
      show: sell,
      count: draftQuotes,
      icon: FileText,
      hue: SECTION_HUES.quotes,
      title: plural(draftQuotes, "Draft quote", "Draft quotes"),
      action: "Finish & send",
      href: "/app/quotes?status=DRAFT",
      urgent: false,
      minor: true,
    },
    {
      show: seeMoney,
      count: draftInvoices,
      icon: Receipt,
      hue: SECTION_HUES.invoices,
      title: plural(draftInvoices, "Draft invoice", "Draft invoices"),
      action: "Finish & send",
      href: "/app/invoices?status=DRAFT",
      urgent: false,
      minor: true,
    },
  ].filter((n) => n.show && n.count > 0);

  // Phones show only what's worth acting on from the couch: the top four,
  // urgency-ordered, drafts left to their list pages. Desktop keeps the
  // full grid.
  const needsMobile = needs.filter((n) => !("minor" in n && n.minor)).slice(0, 4);

  // One sorted "today" list: jobs + sales appointments
  // Compact ledger time ("10:00a") — fits the rail column without wrapping
  const fmtTime = (d: Date) =>
    d
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })
      .replace(" AM", "a")
      .replace(" PM", "p");
  const todayItems = [
    ...todayVisits.map((job) => ({
      id: `j-${job.id}`,
      href: `/app/jobs/${job.id}`,
      apptType: null as string | null,
      time:
        job.scheduledAt && !job.scheduledAnytime ? fmtTime(new Date(job.scheduledAt)) : "Anytime",
      primary: `${job.contact.firstName} ${job.contact.lastName} — ${job.title}`,
      detail: job.assignments.map((a) => a.user.name).join(", ") || null,
      // Phone card splits the line: the JOB leads, the client supports
      title: job.title,
      sub: [
        `${job.contact.firstName} ${job.contact.lastName}`,
        job.assignments.map((a) => a.user.name).join(", ") || null,
      ]
        .filter(Boolean)
        .join(" · "),
      // The hero cares about WHERE — client + street beats assignee names
      heroSub: [
        `${job.contact.firstName} ${job.contact.lastName}`,
        job.address || job.contact.address,
      ]
        .filter(Boolean)
        .join(" · "),
      value: job.lineItems.reduce((s, li) => s + Number(li.total), 0),
      sort: job.scheduledAnytime ? 0 : new Date(job.scheduledAt!).getTime(),
      // Swipe actions on the timeline rows
      phone: job.contact.phone,
      address: job.address ?? job.contact.address,
    })),
    ...todayAppointments.map((a) => ({
      id: `a-${a.id}`,
      href: `/app/appointments/${a.id}`,
      apptType: a.type as string | null,
      time: a.scheduledAnytime ? "Anytime" : fmtTime(new Date(a.scheduledAt)),
      primary: `${a.contact.firstName} ${a.contact.lastName} — ${a.title}`,
      detail: [appointmentTypeLabel[a.type], a.assignedTo?.name ?? null]
        .filter(Boolean)
        .join(" · "),
      title: a.title,
      sub: [`${a.contact.firstName} ${a.contact.lastName}`, appointmentTypeLabel[a.type]]
        .filter(Boolean)
        .join(" · "),
      heroSub: [`${a.contact.firstName} ${a.contact.lastName}`, appointmentTypeLabel[a.type]]
        .filter(Boolean)
        .join(" · "),
      value: 0,
      sort: a.scheduledAnytime ? 0 : new Date(a.scheduledAt).getTime(),
      phone: a.contact.phone,
      // Where the meeting IS — the appointment's own address first (a job
      // site, a coffee shop), the client's home only as the fallback
      address: a.type === "IN_PERSON" ? (a.address ?? a.contact.address) : null,
    })),
  ].sort((x, y) => x.sort - y.sort);

  // The phone hero: the job I'm CLOCKED INTO if it's on today's list (mid-job,
  // its start time has passed — it would otherwise fall out of the hero right
  // when the wrap-up actions matter most), else the first stop that hasn't
  // passed yet (anytime jobs count — they're still work owed today).
  // Everything else lists under Today, including finished stops, so the day
  // keeps its shape.
  const nowT = now.getTime();
  const clockedHero = myOpenEntry?.jobId
    ? (todayItems.find((i) => i.id === `j-${myOpenEntry.jobId}`) ?? null)
    : null;
  const upNext =
    clockedHero ?? todayItems.find((i) => i.sort === 0 || i.sort >= nowT) ?? null;
  const laterToday = todayItems.filter((i) => i !== upNext);

  // Hero action-row context (see UpNextActions): the source records behind the
  // picked item, my clock state on it, and the rendered On-My-Way template.
  const upNextJob = upNext?.id.startsWith("j-")
    ? (todayVisits.find((j) => `j-${j.id}` === upNext.id) ?? null)
    : null;
  const upNextOmwMessage =
    upNextJob?.contact.phone && upNextJob.status === "ACTIVE"
      ? renderMessageTemplate(heroCompany?.onMyWayTemplate || DEFAULT_ON_MY_WAY_TEMPLATE, {
          firstName: upNextJob.contact.firstName,
          lastName: upNextJob.contact.lastName,
          companyName: heroCompany?.name,
          techName: actor.name,
          jobTitle: upNextJob.title,
          address: upNextJob.address ?? upNextJob.contact.address,
          time:
            upNextJob.scheduledAt && !upNextJob.scheduledAnytime
              ? arrivalTimeLabel(
                  heroCompany?.timezone ?? "America/Chicago",
                  upNextJob.scheduledAt,
                  resolveArrivalWindowMinutes(
                    upNextJob.arrivalWindowMinutes,
                    heroCompany?.arrivalWindowMinutes
                  )
                )
              : "",
          // Filled at tap-time by the action row (lib/messaging.ts fillEta)
          eta: "{{eta}}",
        })
      : null;

  // Whole dollars for the glance strip — cents are for detail pages
  const moneyRound = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  const firstName = actor.name?.split(" ")[0] ?? "there";
  const hour = local.hour;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Design system (components/ds, app/ds.css) ─────────────────────────────
  // Desktop and phone are two trees built from the same pieces below: the
  // phone is the iOS-style simple version (hero → numbers → today → needs),
  // the desktop a two-column board. Explanations live in InfoTips.
  const dateLine = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz });
  const monthShort = now.toLocaleDateString("en-US", { month: "short", timeZone: tz });
  const rise = (i: number) => ({ "--ds-i": i }) as React.CSSProperties;

  const heroEl = upNext && (
    <div className="ds-hero ds-rise p-5 lg:p-6" style={rise(1)}>
      <Link prefetch={false} href={upNext.href} className="relative block active:opacity-95">
        <div className="flex items-center justify-between gap-3">
          <span className="ds-hero-pill">
            {upNext === clockedHero ? "On the job" : upNext.apptType ? "Up next · appointment" : "Up next"}
          </span>
          {seePrices && upNext.value > 0 && (
            <span className="text-[15px] font-semibold opacity-90">{money(upNext.value)}</span>
          )}
        </div>
        <p className="mt-4 text-[34px] font-semibold leading-none tracking-[-0.03em] lg:text-[40px]">
          {upNext.time === "Anytime" ? "Anytime today" : upNext.time}
        </p>
        <p className="mt-3 truncate text-[17px] font-semibold">{upNext.title}</p>
        <p className="mt-0.5 truncate text-[13.5px] opacity-80">{upNext.heroSub}</p>
      </Link>
      <UpNextActions
        kind={upNextJob ? "job" : "appointment"}
        id={upNextJob ? upNextJob.id : upNext.id.slice(2)}
        phone={upNext.phone ?? null}
        address={upNext.address ?? null}
        omwMessage={upNextOmwMessage}
        omwSentAt={upNextJob?.onMyWaySentAt?.toISOString() ?? null}
        clockEntry={
          upNextJob && myOpenEntry?.jobId === upNextJob.id
            ? { id: myOpenEntry.id, startedAt: myOpenEntry.startedAt.toISOString() }
            : null
        }
        canClock={upNextJob?.status === "ACTIVE" && actor.role !== "SALES"}
        apptType={upNext.apptType}
      />
    </div>
  );

  const statInfo = {
    collected: "Payments received since the 1st of this month, card, bank, cash and check. The bars are each day so far; today is highlighted.",
    outstanding: "What clients owe you on invoices that are sent and not fully paid, past due included.",
    booked: "The value of jobs on the calendar this week, Sunday through Saturday.",
  };

  // One row per stop. Jobs wear the primary dot, appointments the secondary.
  const todayRow = (item: (typeof todayItems)[number], phone: boolean) => {
    const Icon = item.apptType ? apptIcons[item.apptType as keyof typeof apptIcons] : null;
    const row = (
      <div className="flex items-center">
        <ListRow
          href={item.href}
          className="min-w-0 flex-1"
          lead={
            <span className="flex w-[74px] shrink-0 items-center gap-2.5">
              <span className="ds-num w-12 text-right text-[12.5px] font-semibold text-[color:var(--ds-ink-2)]">
                {item.time}
              </span>
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ background: item.apptType ? "var(--ds-secondary-soft)" : "var(--ds-primary-soft)" }}
              >
                {Icon ? (
                  <Icon size={12} strokeWidth={2.4} style={{ color: "var(--ds-secondary)" }} />
                ) : (
                  <span className="h-2 w-2 rounded-full" style={{ background: "var(--ds-primary)" }} />
                )}
              </span>
            </span>
          }
          title={phone ? item.title : item.primary}
          sub={phone ? item.sub : item.detail}
          trail={
            seePrices && item.value > 0 ? (
              <span className="ds-num shrink-0 text-[13.5px] font-semibold text-[color:var(--ds-ink)]">{money(item.value)}</span>
            ) : undefined
          }
        />
        {phone && item.address && (
          <a
            href={mapsSearchHref(item.address)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Directions to ${item.address}`}
            className="ds-disc mr-3"
          >
            <Navigation size={16} strokeWidth={2.1} />
          </a>
        )}
      </div>
    );
    return phone ? (
      <SwipeRowContact key={item.id} phone={item.phone}>
        {row}
      </SwipeRowContact>
    ) : (
      <div key={item.id}>{row}</div>
    );
  };

  const needsRows = (list: typeof needs) =>
    list.map((n) => (
      <ListRow
        key={n.href}
        href={n.href}
        lead={<span className={`ds-count ${n.urgent ? "ds-count-bad" : ""}`}>{n.count}</span>}
        title={n.title}
        sub={n.action}
        trail={
          <span className="flex shrink-0 items-center gap-2">
            {n.urgent && <Chip tone="bad">Overdue</Chip>}
            <ChevronRight size={16} className="text-[color:var(--ds-faint)]" />
          </span>
        }
      />
    ));

  const allClear = (
    <Card className="flex items-center gap-3 px-5 py-4">
      <CheckCircle2 size={20} className="shrink-0" style={{ color: "var(--ds-good)" }} />
      <p className="text-[14.5px] font-medium">You&apos;re all caught up.</p>
    </Card>
  );

  const needsInfo =
    "Work waiting on you, most urgent first: past-due invoices and bookings to approve lead the list. Tap a row to jump straight to it.";

  const onClockEl = isManager(actor.role) && onClock.length > 0 && (
    <section>
      <SectionTitle info="Everyone clocked in right now, with how long they've been on and where they clocked in.">
        On the clock
      </SectionTitle>
      <Card className="ds-divide overflow-hidden">
        {onClock.map((e) => (
          <ListRow
            key={e.id}
            href={e.job ? `/app/jobs/${e.job.id}` : undefined}
            lead={
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: "var(--ds-good)" }} />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: "var(--ds-good)" }} />
              </span>
            }
            title={e.user.name}
            sub={e.job ? e.job.title : "General time"}
            trail={
              <span className="shrink-0 text-right">
                <span className="ds-num block text-[13.5px] font-semibold">{formatDuration(now.getTime() - e.startedAt.getTime())}</span>
                <span className="ds-small block">
                  since {e.startedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz })}
                </span>
              </span>
            }
          />
        ))}
        <div className="flex gap-1 px-2 py-1.5">
          <Button href="/app/team-map" variant="ghost" size="sm" icon={MapPin} className="flex-1">
            Team map
          </Button>
          <Button href="/app/timesheets" variant="ghost" size="sm" icon={Timer} className="flex-1">
            Timesheets
          </Button>
        </div>
      </Card>
    </section>
  );

  const footer = (
    <div className="mt-12 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-[color:var(--ds-line)] pt-5 text-center">
      <Link prefetch={false} href="/app/roadmap" className="ds-small inline-flex items-center gap-1.5 hover:text-[color:var(--ds-primary)]">
        <Megaphone size={12} />
        See what&apos;s coming next
      </Link>
      <Link prefetch={false} href="/app/support" className="ds-small inline-flex items-center gap-1.5 hover:text-[color:var(--ds-primary)]">
        <LifeBuoy size={12} />
        Found a bug or have an idea? Tell us
      </Link>
    </div>
  );

  const greetingTitle = (
    <>
      {greeting}, <span style={{ color: "var(--ds-primary)" }}>{firstName}</span>
    </>
  );
  const pageInfo =
    "Your day at a glance: the next stop, money in and owed, what's waiting on you, and who's on the clock. Everything follows your company's time zone.";

  return (
    <DsPage>
      <PageHeader
        eyebrow={dateLine}
        title={greetingTitle}
        info={pageInfo}
        actions={
          <span className="hidden gap-2 lg:flex">
            <Button href="/app/schedule" variant="outline" icon={CalendarDays}>
              Schedule
            </Button>
            <Button href="/app/jobs/new" icon={Plus}>
              New job
            </Button>
          </span>
        }
      />

      {/* ─────────────── Phone ─────────────── */}
      <div className="mt-6 flex flex-col gap-7 lg:hidden">
        {heroEl}

        {seePerformance && (
          <Card className="ds-rise grid grid-cols-3" style={rise(2)}>
            {[
              { href: "/app/invoices", label: `Collected · ${monthShort}`, value: moneyRound(monthRevenue), bad: false },
              { href: "/app/invoices?status=AWAITING_PAYMENT", label: "Outstanding", value: moneyRound(receivableTotal), bad: receivableTotal > 0 },
              { href: "/app/jobs", label: "This week", value: moneyRound(weekRevenue), bad: false },
            ].map((s, i) => (
              <Link
                prefetch={false}
                key={s.href}
                href={s.href}
                className={`min-w-0 px-3.5 py-4 active:opacity-70 ${i > 0 ? "border-l border-[color:var(--ds-line)]" : ""}`}
              >
                <p className="truncate text-[20px] font-semibold leading-none tracking-[-0.02em]" style={s.bad ? { color: "var(--ds-bad)" } : undefined}>
                  <CountUp value={s.value} />
                </p>
                <p className="ds-small mt-1.5 truncate text-[11.5px]">{s.label}</p>
              </Link>
            ))}
          </Card>
        )}

        <AtlasHomeButton appearance="ds" />

        <section className="ds-rise" style={rise(3)} data-tour="today">
          <SectionTitle action={<ActionLink href="/app/schedule">Schedule</ActionLink>}>
            Today
            {todayItems.length > 0 && (
              <span className="ds-small ml-1 font-normal">· {todayItems.length} {todayItems.length === 1 ? "stop" : "stops"}</span>
            )}
          </SectionTitle>
          {todayItems.length === 0 ? (
            <Card>
              <Hint title="Nothing on the books today." action={{ href: "/app/jobs/new", label: "Schedule a job", icon: Plus }} />
            </Card>
          ) : laterToday.length === 0 ? (
            <Card className="px-5 py-4">
              <p className="ds-body">That&apos;s your only stop. Nothing after it.</p>
            </Card>
          ) : (
            <Card className="ds-divide overflow-hidden">{laterToday.map((item) => todayRow(item, true))}</Card>
          )}
        </section>

        <section className="ds-rise" style={rise(4)} data-tour="workflow">
          <SectionTitle info={needsInfo}>Needs you</SectionTitle>
          {needsMobile.length === 0 ? allClear : <Card className="ds-divide overflow-hidden">{needsRows(needsMobile)}</Card>}
        </section>

        {onClockEl}

        {showSetupCard && <DashboardSetupCard />}
        <PushNudge />
        {footer}
      </div>

      {/* ─────────────── Desktop ─────────────── */}
      <div className="hidden lg:block">
        {showSetupCard && (
          <div className="mt-6">
            <DashboardSetupCard />
          </div>
        )}
        <PushNudge />

        {seePerformance && (
          <div className="mt-7 grid grid-cols-3 gap-4">
            <Stat
              className="ds-rise"
              style={rise(1)}
              href="/app/invoices"
              label="Collected"
              info={statInfo.collected}
              value={<CountUp value={money(monthRevenue)} />}
              foot="this month"
            >
              {dailyRevenue.length > 1 && monthRevenue > 0 && <Sparkline values={dailyRevenue} />}
            </Stat>
            <Stat
              className="ds-rise"
              style={rise(2)}
              href="/app/invoices?status=AWAITING_PAYMENT"
              label="Outstanding"
              info={statInfo.outstanding}
              tone={receivableTotal > 0 ? "bad" : undefined}
              value={<CountUp value={money(receivableTotal)} />}
              foot={`${receivableClients} ${receivableClients === 1 ? "client owes" : "clients owe"} you`}
            />
            <Stat
              className="ds-rise"
              style={rise(3)}
              href="/app/jobs"
              label="Booked this week"
              info={statInfo.booked}
              value={<CountUp value={money(weekRevenue)} />}
              foot={`${upcomingJobsWeek.length} ${upcomingJobsWeek.length === 1 ? "job" : "jobs"} scheduled`}
            />
          </div>
        )}

        <div className="mt-8 grid grid-cols-[1.45fr_1fr] items-start gap-6">
          <div className="flex flex-col gap-6">
            {heroEl}
            <section className="ds-rise" style={rise(4)} data-tour="today">
              <SectionTitle action={<ActionLink href="/app/schedule">Open schedule</ActionLink>}>
                Today
                {todayItems.length > 0 && (
                  <span className="ds-small ml-1 font-normal">· {todayItems.length} {todayItems.length === 1 ? "stop" : "stops"}</span>
                )}
              </SectionTitle>
              {todayItems.length === 0 ? (
                <Card>
                  <Hint title="Nothing on the books today." action={{ href: "/app/jobs/new", label: "Schedule a job", icon: Plus }} />
                </Card>
              ) : (
                <Card className="ds-divide overflow-hidden">{todayItems.map((item) => todayRow(item, false))}</Card>
              )}
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section className="ds-rise" style={rise(5)} data-tour="workflow">
              <SectionTitle info={needsInfo}>Needs you</SectionTitle>
              {needs.length === 0 ? allClear : <Card className="ds-divide overflow-hidden">{needsRows(needs)}</Card>}
            </section>
            {onClockEl}
          </div>
        </div>
        {footer}
      </div>
    </DsPage>
  );
}
