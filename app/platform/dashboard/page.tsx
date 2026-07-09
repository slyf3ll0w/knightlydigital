import { prisma } from "@/lib/db";
import Link from "next/link";
import {
  Inbox,
  FileText,
  Briefcase,
  Receipt,
  ArrowRight,
  Phone,
  Video,
  MapPin,
  CheckCircle2,
  CalendarPlus,
  CalendarCheck,
} from "lucide-react";
import { money, appointmentTypeLabel } from "@/lib/statuses";
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
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 100;
  const gap = 1.5;
  const bw = (w - gap * (values.length - 1)) / values.length;
  return (
    <svg viewBox={`0 0 ${w} 24`} className="mt-2 h-6 w-full" preserveAspectRatio="none" aria-hidden>
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
            fill={v > 0 ? "#22C55E" : "#E7E5E4"}
            opacity={v > 0 ? 0.85 : 1}
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
      title: plural(needsApprovalRequests, "Booking to approve", "Bookings to approve"),
      action: "Accept or decline",
      href: "/app/requests?status=NEEDS_APPROVAL",
      urgent: true,
    },
    {
      show: seeMoney,
      count: pastDueInvoices,
      icon: Receipt,
      title: plural(pastDueInvoices, "Past-due invoice", "Past-due invoices"),
      action: "Send a reminder",
      href: "/app/invoices?status=PAST_DUE",
      urgent: true,
    },
    {
      show: sell,
      count: newRequests,
      icon: Inbox,
      title: plural(newRequests, "New request", "New requests"),
      action: "Review & send a quote",
      href: "/app/requests?status=NEW",
      urgent: false,
    },
    {
      show: sell,
      count: changesRequestedQuotes,
      icon: FileText,
      title: "Changes requested",
      action: "Update the quote",
      href: "/app/quotes?status=CHANGES_REQUESTED",
      urgent: false,
    },
    {
      show: sell,
      count: approvedQuotes,
      icon: FileText,
      title: plural(approvedQuotes, "Approved quote", "Approved quotes"),
      action: "Convert to a job",
      href: "/app/quotes?status=APPROVED",
      urgent: false,
    },
    {
      show: seeMoney,
      count: requiresInvoicingJobs,
      icon: Briefcase,
      title: plural(requiresInvoicingJobs, "Job ready to invoice", "Jobs ready to invoice"),
      action: "Send the invoice",
      href: "/app/jobs?status=REQUIRES_INVOICING",
      urgent: false,
    },
    {
      show: true,
      count: unscheduledJobs,
      icon: CalendarPlus,
      title: plural(unscheduledJobs, "Unscheduled job", "Unscheduled jobs"),
      action: "Put it on the calendar",
      href: "/app/jobs?status=ACTIVE&unscheduled=1",
      urgent: false,
    },
    {
      show: sell,
      count: draftQuotes,
      icon: FileText,
      title: plural(draftQuotes, "Draft quote", "Draft quotes"),
      action: "Finish & send",
      href: "/app/quotes?status=DRAFT",
      urgent: false,
    },
    {
      show: seeMoney,
      count: draftInvoices,
      icon: Receipt,
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
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="numeral-ledger mt-0.5 text-[27px] font-semibold text-gray-900">
          {greeting}, {firstName}
        </h1>
      </div>

      {showSetupCard && <DashboardSetupCard />}
      <PushNudge />

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {needs.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`card-ledger group p-4 transition-shadow hover:shadow-md ${
                  n.urgent ? "border-red-200" : ""
                }`}
              >
                <div className="mb-3 flex items-center justify-between">
                  <n.icon size={15} className={n.urgent ? "text-red-500" : "text-gray-400"} />
                  {n.urgent && (
                    <span className="stamp border-red-300 bg-red-50 text-red-600">Overdue</span>
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
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* ── Today's appointments — timeline with a time rail ─────────────── */}
        <div className="card-ledger anim-fade-up anim-delay-2 self-start" data-tour="today">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Today&apos;s appointments</h2>
            <Link href="/app/schedule" className="text-sm text-green-600 hover:underline font-medium">
              View schedule
            </Link>
          </div>
          {todayItems.length === 0 ? (
            <EmptyState
              art="schedule"
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
                    <span className="w-12 shrink-0 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500">
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

        {/* ── Business performance rail ────────────────────────────────────── */}
        {seePerformance && (
        <div className="anim-fade-up anim-delay-3">
          <RuledLabel>Performance</RuledLabel>
          <div className="space-y-3">
            <Link
              href="/app/invoices?status=AWAITING_PAYMENT"
              className="block card-ledger p-4 hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-gray-500 mb-1">Receivables</p>
              <p className="numeral-ledger text-[22px] font-semibold text-gray-900">
                {receivableTotal > 0 ? money(receivableTotal) : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {receivableClients} {receivableClients === 1 ? "client owes" : "clients owe"} you
              </p>
            </Link>
            <Link
              href="/app/jobs"
              className="block card-ledger p-4 hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-gray-500 mb-1">Upcoming jobs</p>
              <p className="numeral-ledger text-[22px] font-semibold text-gray-900">
                {weekRevenue > 0 ? money(weekRevenue) : "—"}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                This week ({upcomingJobsWeek.length} jobs)
              </p>
            </Link>
            <Link
              href="/app/invoices"
              className="block card-ledger p-4 hover:shadow-md transition-shadow"
            >
              <p className="text-xs font-medium text-gray-500 mb-1">Revenue</p>
              <p className="numeral-ledger text-[22px] font-semibold text-gray-900">
                {money(monthRevenue)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">This month so far</p>
              {dailyRevenue.length > 1 && monthRevenue > 0 && <Sparkline values={dailyRevenue} />}
            </Link>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
