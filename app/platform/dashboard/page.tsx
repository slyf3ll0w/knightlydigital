import { prisma } from "@/lib/db";
import Link from "next/link";
import {
  Inbox,
  FileText,
  Briefcase,
  Receipt,
  ArrowRight,
  ChevronRight,
  Phone,
  Video,
  MapPin,
  CheckCircle2,
  CalendarPlus,
  CalendarCheck,
  Megaphone,
  Timer,
} from "lucide-react";
import { money, appointmentTypeLabel } from "@/lib/statuses";
import { SECTION_HUES, hueTint } from "@/lib/section-colors";
import { formatDuration, mapsHref } from "@/lib/time-entries";
import EmptyState from "@/components/EmptyState";
import DashboardSetupCard from "./DashboardSetupCard";
import { PushNudge } from "@/components/PushNotifications";
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
function Sparkline({ values, className = "text-green-600" }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  const w = 100;
  const gap = 1.5;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg
      viewBox={`0 0 ${w} 24`}
      className={`mt-2 h-6 w-full ${className}`}
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
            fill="currentColor"
            opacity={v > 0 ? 0.85 : 0.15}
          />
        );
      })}
    </svg>
  );
}

/** Section label with a ledger hairline running out to the right edge. */
function RuledLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-500">{children}</p>
      <div className="h-px flex-1 bg-gray-300/60" />
    </div>
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

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(startOfDay.getTime() - startOfDay.getDay() * 86400000);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 86400000);

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
  ]);
  const showSetupCard = isManager(actor.role) && setupCompany?.setupWizardAt == null;

  const receivableTotal = receivables.reduce((s, inv) => {
    const paid = inv.payments.reduce((p, x) => p + Number(x.amount), 0);
    return s + Number(inv.total) - paid;
  }, 0);
  const receivableClients = new Set(receivables.map((i) => i.contactId).filter(Boolean)).size;
  const weekRevenue = upcomingJobsWeek.reduce(
    (s, j) => s + j.lineItems.reduce((t, li) => t + Number(li.total), 0),
    0
  );
  // Daily revenue buckets for the sparkline (1st of month → today)
  const monthRevenue = monthPayments.reduce((s, p) => s + Number(p.amount), 0);
  const dailyRevenue = Array.from({ length: now.getDate() }, () => 0);
  for (const p of monthPayments) {
    const day = new Date(p.paidAt).getDate() - 1;
    if (day >= 0 && day < dailyRevenue.length) dailyRevenue[day] += Number(p.amount);
  }

  // "Needs you" — the same lifecycle counts, but reframed as a prioritized
  // to-do list with an action verb. Only items with something waiting render,
  // so a quiet day reads calm instead of showing a wall of zeros. Urgent
  // (money overdue) sorts first.
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const needs = [
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
    },
  ].filter((n) => n.show && n.count > 0);

  // One sorted "today" list: jobs + sales appointments
  // Compact ledger time ("10:00a") — fits the rail column without wrapping
  const fmtTime = (d: Date) =>
    d
      .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
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
      value: job.lineItems.reduce((s, li) => s + Number(li.total), 0),
      sort: job.scheduledAnytime ? 0 : new Date(job.scheduledAt!).getTime(),
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
      value: 0,
      sort: a.scheduledAnytime ? 0 : new Date(a.scheduledAt).getTime(),
    })),
  ].sort((x, y) => x.sort - y.sort);

  const firstName = actor.name?.split(" ")[0] ?? "there";
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-7 anim-fade-up">
        {/* Mobile shows the date on the Today card instead */}
        <p className="hidden lg:block text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        {/* Two-tone greeting, like the marketing headline — the name carries
            the brand accent (text-green-* bridges to the tenant color) */}
        <h1 className="font-display mt-0.5 text-[27px] font-bold tracking-tight text-gray-900">
          {greeting}, <span className="text-green-600">{firstName}</span>
        </h1>
      </div>

      {showSetupCard && <DashboardSetupCard />}
      <PushNudge />

      {/* ── Money first (Amex pattern): collected in green, owed in red ────── */}
      {/* Phone: one ledger "statement" instead of three stacked white cards —
          stamp label, big numeral, then a double-rule foot exactly like the
          list-page ledger feet, so the money card speaks the product's own
          receipt language. */}
      {seePerformance && (
        <Link
          href="/app/invoices"
          className="card-tool anim-fade-up anim-delay-1 mb-8 block overflow-hidden lg:hidden"
        >
          <div className="p-5 pb-4">
            <span
              className="mb-2.5 block h-[3px] w-7 rounded-full"
              style={{ backgroundColor: "var(--wb-accent, #0B57D8)" }}
              aria-hidden
            />
            <p className="stamp text-green-700">
              Collected · {now.toLocaleDateString("en-US", { month: "long" })}
            </p>
            <p className="numeral-ledger mt-2 text-[34px] leading-none font-semibold text-gray-900">
              {money(monthRevenue)}
            </p>
            {dailyRevenue.length > 1 && monthRevenue > 0 && <Sparkline values={dailyRevenue} />}
          </div>
          <div className="flex divide-x divide-gray-100 border-t-2 border-double border-gray-300 bg-gray-50/60">
            <div className="min-w-0 flex-1 px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Outstanding
              </p>
              <p
                className={`numeral-ledger mt-0.5 truncate text-base leading-tight font-semibold ${
                  receivableTotal > 0 ? "text-red-600" : "text-gray-900"
                }`}
              >
                {receivableTotal > 0 ? money(receivableTotal) : "—"}
              </p>
            </div>
            <div className="min-w-0 flex-1 px-5 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                Booked this week
              </p>
              <p className="numeral-ledger mt-0.5 truncate text-base leading-tight font-semibold text-gray-900">
                {upcomingJobsWeek.length > 0 ? money(weekRevenue) : "—"}
              </p>
            </div>
          </div>
        </Link>
      )}
      {seePerformance && (
        <div className="anim-fade-up anim-delay-1 mb-8 hidden gap-3 lg:grid lg:grid-cols-3">
          <Link
            href="/app/invoices"
            className="card-ledger block p-4 transition-shadow hover:shadow-md"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              Collected
            </p>
            <p className="numeral-ledger mt-1 text-[24px] leading-none font-semibold text-green-700">
              {money(monthRevenue)}
            </p>
            <p className="mt-1.5 text-xs text-gray-500">this month</p>
            {dailyRevenue.length > 1 && monthRevenue > 0 && <Sparkline values={dailyRevenue} />}
          </Link>
          <Link
            href="/app/invoices?status=AWAITING_PAYMENT"
            className="card-ledger block p-4 transition-shadow hover:shadow-md"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              Outstanding
            </p>
            <p
              className={`numeral-ledger mt-1 text-[24px] leading-none font-semibold ${
                receivableTotal > 0 ? "text-red-600" : "text-gray-900"
              }`}
            >
              {receivableTotal > 0 ? money(receivableTotal) : "—"}
            </p>
            <p className="mt-1.5 text-xs text-gray-500">
              {receivableClients} {receivableClients === 1 ? "client owes" : "clients owe"} you
            </p>
          </Link>
          <Link
            href="/app/jobs"
            className="card-ledger col-span-2 block p-4 transition-shadow hover:shadow-md lg:col-span-1"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
              Booked this week
            </p>
            <p className="numeral-ledger mt-1 text-[24px] leading-none font-semibold text-gray-900">
              {upcomingJobsWeek.length > 0 ? money(weekRevenue) : "—"}
            </p>
            <p className="mt-1.5 text-xs text-gray-500">
              {upcomingJobsWeek.length} {upcomingJobsWeek.length === 1 ? "job" : "jobs"} scheduled
            </p>
          </Link>
        </div>
      )}

      {/* ── On the clock — who's working right now (owners/admins) ─────────── */}
      {isManager(actor.role) && onClock.length > 0 && (
        <div className="anim-fade-up anim-delay-1 mb-8">
          <RuledLabel>On the clock</RuledLabel>
          <div className="card-ledger divide-y divide-gray-50">
            {onClock.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-5 py-3">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{e.user.name}</p>
                  {e.job ? (
                    <Link
                      href={`/app/jobs/${e.job.id}`}
                      className="text-xs text-green-700 hover:underline truncate block"
                    >
                      {e.job.title}
                    </Link>
                  ) : (
                    <p className="text-xs text-gray-500">General time</p>
                  )}
                </div>
                {e.startLat != null && e.startLng != null && (
                  <a
                    href={mapsHref(e.startLat, e.startLng)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Clock-in location"
                    className="text-gray-400 hover:text-green-700"
                  >
                    <MapPin size={15} />
                  </a>
                )}
                <div className="text-right shrink-0">
                  <p className="numeral-ledger text-sm font-semibold text-gray-900 tabular-nums">
                    {formatDuration(now.getTime() - e.startedAt.getTime())}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    since{" "}
                    {e.startedAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            <div className="grid grid-cols-2 divide-x divide-gray-50">
              <Link
                href="/app/team-map"
                className="flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-green-700 hover:bg-gray-50 transition-colors"
              >
                <MapPin size={12} />
                Team map
                <ArrowRight size={11} />
              </Link>
              <Link
                href="/app/timesheets"
                className="flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-green-700 hover:bg-gray-50 transition-colors"
              >
                <Timer size={12} />
                Timesheets
                <ArrowRight size={11} />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Needs you ──────────────────────────────────────────────────────── */}
      <div className="anim-fade-up anim-delay-1 mb-8" data-tour="workflow">
        <RuledLabel>Needs you</RuledLabel>
        {needs.length === 0 ? (
          <div className="card-ledger flex items-center gap-3 px-5 py-4">
            <CheckCircle2 size={20} className="text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">You&apos;re all caught up</p>
              <p className="text-xs text-gray-500">Nothing needs your attention right now.</p>
            </div>
          </div>
        ) : (
          <>
          {/* Phone: one prioritized list — each row is a task with its section
              hue, not a wall of 2-up number cards */}
          <div className="card-tool divide-y divide-gray-100 overflow-hidden lg:hidden">
            {needs.map((n) => {
              const ink = n.urgent ? "#DC2626" : n.hue ?? SECTION_HUES.invoices;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-gray-100"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                    style={{ backgroundColor: hueTint(ink, 0.1), color: ink }}
                  >
                    <n.icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900">{n.title}</span>
                      {n.urgent && <span className="stamp shrink-0 text-red-600">Overdue</span>}
                    </span>
                    <span className="block truncate text-xs text-gray-500">{n.action}</span>
                  </span>
                  <span
                    className="numeral-ledger shrink-0 text-lg font-semibold"
                    style={{ color: ink }}
                  >
                    {n.count}
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-gray-400" />
                </Link>
              );
            })}
          </div>
          <div className="hidden lg:grid lg:grid-cols-4 gap-3">
            {needs.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`card-ledger group p-4 transition-shadow hover:shadow-md ${
                  n.urgent ? "border-red-200" : ""
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <n.icon
                    size={15}
                    className={n.urgent ? "text-red-500" : undefined}
                    style={n.urgent ? undefined : { color: n.hue }}
                  />
                  {n.urgent && (
                    <span className="stamp text-red-600">Overdue</span>
                  )}
                </div>
                <p className="numeral-ledger text-[34px] leading-none font-semibold text-gray-900">
                  {n.count}
                </p>
                <p className="mt-2 text-sm font-semibold text-gray-800">{n.title}</p>
                <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-green-700">
                  {n.action}
                  <ArrowRight
                    size={11}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </p>
              </Link>
            ))}
          </div>
          </>
        )}
      </div>

      {/* ── Today's appointments ──────────────────────────────────────────── */}
      {/* Phone: tool-card day sheet — stamp header, hue-tiled stops (jobs vs
          appointments carry their section hue), ledger foot to the schedule. */}
      <div
        className="card-tool anim-fade-up anim-delay-2 self-start overflow-hidden lg:hidden"
        data-tour="today"
      >
        <div className="flex items-start justify-between border-b border-gray-100 px-4 pb-3 pt-4">
          <div>
            <span
              className="mb-2 block h-[3px] w-7 rounded-full"
              style={{ backgroundColor: "var(--wb-accent, #0B57D8)" }}
              aria-hidden
            />
            <p className="stamp text-green-700">
              Today ·{" "}
              {now.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
          {todayItems.length > 0 && (
            <p className="numeral-ledger text-xl leading-none font-semibold text-gray-900">
              {todayItems.length}
              <span className="ml-1 text-xs font-medium text-gray-500">
                {todayItems.length === 1 ? "stop" : "stops"}
              </span>
            </p>
          )}
        </div>
        {todayItems.length === 0 ? (
          <EmptyState
            art="schedule"
            hue={SECTION_HUES.schedule}
            title="Nothing scheduled today"
            body="Jobs and appointments you schedule for today will show up here."
            actionHref="/app/jobs/new"
            actionLabel="Schedule a Job"
            showPlusIcon={false}
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {todayItems.map((item) => {
              const Icon = item.apptType
                ? apptIcons[item.apptType as keyof typeof apptIcons]
                : Briefcase;
              const hue = item.apptType ? SECTION_HUES.schedule : SECTION_HUES.jobs;
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-gray-50"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]"
                    style={{ backgroundColor: hueTint(hue, 0.1), color: hue }}
                  >
                    <Icon size={15} strokeWidth={2.25} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{item.primary}</p>
                    {item.detail && (
                      <p className="truncate text-xs text-gray-500">{item.detail}</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="numeral-ledger text-[13px] font-semibold text-gray-900">
                      {item.time}
                    </p>
                    {seePrices && item.value > 0 && (
                      <p className="text-xs font-medium text-gray-500">{money(item.value)}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <Link
          href="/app/schedule"
          className="flex items-center justify-between border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 text-xs font-semibold text-green-700"
        >
          Open schedule
          <ArrowRight size={12} />
        </Link>
      </div>

      {/* Desktop: timeline with a time rail — unchanged */}
      <div
        className="card-ledger anim-fade-up anim-delay-2 hidden self-start lg:block"
        data-tour="today"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-display font-bold text-gray-900">Today</h2>
          <Link href="/app/schedule" className="font-display text-sm text-green-600 hover:underline font-semibold">
            Schedule →
          </Link>
        </div>
          {todayItems.length === 0 ? (
            <EmptyState
              art="schedule"
              hue={SECTION_HUES.schedule}
              title="Nothing scheduled today"
              body="Jobs and appointments you schedule for today will show up here."
              actionHref="/app/jobs/new"
              actionLabel="Schedule a Job"
              showPlusIcon={false}
            />
          ) : (
            <div className="relative px-5 py-2">
              {/* the rail: vertical hairline running behind the row markers */}
              <div className="absolute left-[6.15rem] top-4 bottom-4 w-px bg-gray-200" aria-hidden />
              {todayItems.map((item) => {
                const Icon = item.apptType
                  ? apptIcons[item.apptType as keyof typeof apptIcons]
                  : null;
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-center gap-4 py-3 -mx-2 px-2 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    <span className="font-display w-12 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                      {item.time}
                    </span>
                    <span
                      className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white ${
                        Icon ? "border-blue-200" : "border-gray-200"
                      }`}
                    >
                      {Icon ? (
                        <Icon size={13} className="text-blue-600" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{item.primary}</p>
                      {item.detail && (
                        <p className="text-xs text-gray-500 truncate">{item.detail}</p>
                      )}
                    </div>
                    {seePrices && item.value > 0 && (
                      <span className="text-sm font-semibold text-gray-900">{money(item.value)}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
      </div>

      {/* Quiet pointer to the roadmap — deliberately not in the sidebar */}
      <div className="mt-10 pt-5 border-t border-gray-200 text-center">
        <Link
          href="/app/roadmap"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-green-700 transition-colors"
        >
          <Megaphone size={12} />
          See what&apos;s coming next — Upcoming Features
          <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}
