import { prisma } from "@/lib/db";
import Link from "next/link";
import { Inbox, FileText, Briefcase, Receipt, ArrowRight, Phone, Video, MapPin } from "lucide-react";
import { money, appointmentTypeLabel, type StatusKind } from "@/lib/statuses";
import StatusChip from "@/components/StatusChip";
import EmptyState from "@/components/EmptyState";
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
    archivedRequests,
    approvedQuotes,
    draftQuotes,
    changesRequestedQuotes,
    requiresInvoicingJobs,
    activeJobs,
    unscheduledJobs,
    awaitingInvoices,
    draftInvoices,
    pastDueInvoices,
    todayVisits,
    todayAppointments,
    receivables,
    upcomingJobsWeek,
    monthPayments,
  ] = await Promise.all([
    prisma.request.count({ where: { companyId, ...leadScope, status: "NEW" } }),
    prisma.request.count({ where: { companyId, ...leadScope, status: "ARCHIVED" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "APPROVED" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "DRAFT" } }),
    prisma.quote.count({ where: { companyId, ...leadScope, status: "CHANGES_REQUESTED" } }),
    prisma.job.count({ where: { companyId, ...jScope, status: "REQUIRES_INVOICING" } }),
    prisma.job.count({ where: { companyId, ...jScope, status: "ACTIVE" } }),
    prisma.job.count({ where: { companyId, ...jScope, status: "ACTIVE", scheduledAt: null } }),
    prisma.invoice.count({ where: { companyId, ...leadScope, status: "AWAITING_PAYMENT" } }),
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
  ]);

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

  // Workflow ledger: one column per lifecycle entity, headline status + 2 secondary
  const workflow: {
    label: string;
    icon: typeof Inbox;
    kind: StatusKind;
    show: boolean;
    headline: { count: number; status: string; href: string };
    secondary: { count: number; label: string; href: string }[];
  }[] = [
    {
      show: sell,
      label: "Requests",
      icon: Inbox,
      kind: "request",
      headline: { count: newRequests, status: "NEW", href: "/app/requests?status=NEW" },
      secondary: [
        { count: archivedRequests, label: "Archived", href: "/app/requests?status=ARCHIVED" },
      ],
    },
    {
      show: sell,
      label: "Quotes",
      icon: FileText,
      kind: "quote",
      headline: { count: approvedQuotes, status: "APPROVED", href: "/app/quotes?status=APPROVED" },
      secondary: [
        { count: draftQuotes, label: "Draft", href: "/app/quotes?status=DRAFT" },
        {
          count: changesRequestedQuotes,
          label: "Changes requested",
          href: "/app/quotes?status=CHANGES_REQUESTED",
        },
      ],
    },
    {
      show: true,
      label: "Jobs",
      icon: Briefcase,
      kind: "job",
      headline: {
        count: requiresInvoicingJobs,
        status: "REQUIRES_INVOICING",
        href: "/app/jobs?status=REQUIRES_INVOICING",
      },
      secondary: [
        { count: activeJobs, label: "Active", href: "/app/jobs?status=ACTIVE" },
        { count: unscheduledJobs, label: "Unscheduled", href: "/app/jobs?status=ACTIVE&unscheduled=1" },
      ],
    },
    {
      show: seeMoney,
      label: "Invoices",
      icon: Receipt,
      kind: "invoice",
      headline: {
        count: awaitingInvoices,
        status: "AWAITING_PAYMENT",
        href: "/app/invoices?status=AWAITING_PAYMENT",
      },
      secondary: [
        { count: draftInvoices, label: "Draft", href: "/app/invoices?status=DRAFT" },
        { count: pastDueInvoices, label: "Past due", href: "/app/invoices?status=PAST_DUE" },
      ],
    },
  ];

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

  // Workflow column dividers: hairlines between cells in both grid layouts
  // (2-col on mobile, 4-col on lg) without double borders at the edges.
  const cellRules =
    "border-gray-200/80 max-lg:odd:border-r max-lg:[&:nth-child(n+3)]:border-t lg:border-l lg:first:border-l-0";

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

      {/* ── Workflow ledger ────────────────────────────────────────────────── */}
      <div className="anim-fade-up anim-delay-1 mb-8">
        <RuledLabel>Workflow</RuledLabel>
        <div className="card-ledger grid grid-cols-2 lg:grid-cols-4 overflow-hidden">
          {workflow.filter((w) => w.show).map((w) => (
            <div key={w.label} className={`flex flex-col ${cellRules}`}>
              <Link
                href={w.headline.href}
                className="block flex-1 p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-2 mb-3">
                  <w.icon size={15} className="text-gray-400" />
                  <span className="text-sm font-semibold text-gray-700">{w.label}</span>
                </div>
                <p className="numeral-ledger text-[34px] leading-none font-semibold text-gray-900">
                  {w.headline.count}
                </p>
                <StatusChip kind={w.kind} status={w.headline.status} className="mt-2.5" />
              </Link>
              <div className="border-t border-gray-100 divide-y divide-gray-100">
                {w.secondary.map((s) => (
                  <Link
                    key={s.label}
                    href={s.href}
                    className="flex items-center justify-between px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    <span className="truncate">
                      {s.label} ({s.count})
                    </span>
                    <ArrowRight size={11} className="text-gray-300 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* ── Today's appointments — timeline with a time rail ─────────────── */}
        <div className="card-ledger anim-fade-up anim-delay-2 self-start">
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
