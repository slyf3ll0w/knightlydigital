import { prisma } from "@/lib/db";
import Link from "next/link";
import { Inbox, FileText, Briefcase, Receipt, ArrowRight } from "lucide-react";
import { money, type StatusKind } from "@/lib/statuses";
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
} from "@/lib/permissions";

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
    prisma.payment.aggregate({
      where: seePerformance
        ? { companyId, paidAt: { gte: startOfMonth } }
        : { companyId, id: "none" }, // skipped for non-managers
      _sum: { amount: true },
    }),
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

  // Workflow strip: one card per lifecycle entity, headline status + 2 secondary
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

  const firstName = actor.name?.split(" ")[0] ?? "there";
  const hour = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <p className="text-sm text-gray-500">
          {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {firstName}
        </h1>
      </div>

      {/* ── Workflow strip ─────────────────────────────────────────────────── */}
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Workflow</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {workflow.filter((w) => w.show).map((w) => (
          <div key={w.label} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <Link
              href={w.headline.href}
              className="block p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2 mb-3">
                <w.icon size={15} className="text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">{w.label}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{w.headline.count}</p>
              <StatusChip kind={w.kind} status={w.headline.status} className="mt-1.5" />
            </Link>
            <div className="border-t border-gray-100 divide-y divide-gray-100">
              {w.secondary.map((s) => (
                <Link
                  key={s.label}
                  href={s.href}
                  className="flex items-center justify-between px-4 py-2 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <span>
                    {s.label} ({s.count})
                  </span>
                  <ArrowRight size={11} className="text-gray-300" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        {/* ── Today's appointments ─────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-lg">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Today&apos;s appointments</h2>
            <Link href="/app/schedule" className="text-sm text-green-600 hover:underline font-medium">
              View schedule
            </Link>
          </div>
          {todayVisits.length === 0 ? (
            <EmptyState
              art="schedule"
              title="Nothing scheduled today"
              body="Appointments you schedule for today will show up here."
              actionHref="/app/jobs/new"
              actionLabel="Schedule a Job"
              showPlusIcon={false}
            />
          ) : (
            <div className="divide-y divide-gray-50">
              {todayVisits.map((job) => {
                const value = job.lineItems.reduce((s, li) => s + Number(li.total), 0);
                return (
                  <Link
                    key={job.id}
                    href={`/app/jobs/${job.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {job.contact.firstName} {job.contact.lastName} — {job.title}
                      </p>
                      <p className="text-xs text-gray-500">
                        {job.scheduledAt && !job.scheduledAnytime
                          ? new Date(job.scheduledAt).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })
                          : "Anytime"}
                        {job.assignments.length > 0 &&
                          ` · ${job.assignments.map((a) => a.user.name).join(", ")}`}
                      </p>
                    </div>
                    {seePrices && value > 0 && (
                      <span className="text-sm font-semibold text-gray-900">{money(value)}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Business performance rail ────────────────────────────────────── */}
        {seePerformance && (
        <div className="space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm px-1">Business performance</h2>
          <Link
            href="/app/invoices?status=AWAITING_PAYMENT"
            className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-xs font-medium text-gray-500 mb-1">Receivables</p>
            <p className="text-xl font-bold text-gray-900">
              {receivableTotal > 0 ? money(receivableTotal) : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {receivableClients} {receivableClients === 1 ? "client owes" : "clients owe"} you
            </p>
          </Link>
          <Link
            href="/app/jobs"
            className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-xs font-medium text-gray-500 mb-1">Upcoming jobs</p>
            <p className="text-xl font-bold text-gray-900">
              {weekRevenue > 0 ? money(weekRevenue) : "—"}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">This week ({upcomingJobsWeek.length} jobs)</p>
          </Link>
          <Link
            href="/app/invoices"
            className="block bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <p className="text-xs font-medium text-gray-500 mb-1">Revenue</p>
            <p className="text-xl font-bold text-gray-900">
              {money(Number(monthPayments._sum.amount) || 0)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">This month so far</p>
          </Link>
        </div>
        )}
      </div>
    </div>
  );
}
