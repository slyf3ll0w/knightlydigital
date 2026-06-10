import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Briefcase, CalendarDays, DollarSign, TrendingUp, Plus, ArrowRight } from "lucide-react";

const statusColors: Record<string, string> = {
  LEAD: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-amber-100 text-amber-700",
  IN_PROGRESS: "bg-orange-100 text-orange-700",
  COMPLETE: "bg-teal-100 text-teal-700",
  INVOICED: "bg-violet-100 text-violet-700",
  PAID: "bg-green-100 text-green-700",
};

const statusLabel: Record<string, string> = {
  LEAD: "Lead",
  SCHEDULED: "Scheduled",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  INVOICED: "Invoiced",
  PAID: "Paid",
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [openJobs, scheduledToday, unpaidInvoices, monthPayments, recentJobs, newBookings] =
    await Promise.all([
      prisma.job.count({
        where: { companyId, status: { in: ["LEAD", "SCHEDULED", "IN_PROGRESS"] } },
      }),
      prisma.job.count({
        where: {
          companyId,
          scheduledAt: { gte: startOfDay, lt: endOfDay },
        },
      }),
      prisma.invoice.aggregate({
        where: { companyId, status: { in: ["SENT", "OVERDUE"] } },
        _sum: { total: true },
      }),
      prisma.payment.aggregate({
        where: { companyId, paidAt: { gte: startOfMonth } },
        _sum: { amount: true },
      }),
      prisma.job.findMany({
        where: { companyId },
        include: { contact: true, assignments: { include: { user: true } } },
        orderBy: { updatedAt: "desc" },
        take: 8,
      }),
      prisma.bookingRequest.count({ where: { companyId, status: "NEW" } }),
    ]);

  const stats = [
    {
      label: "Open Jobs",
      value: openJobs,
      icon: Briefcase,
      color: "text-blue-600",
      bg: "bg-blue-50",
      href: "/app/jobs",
    },
    {
      label: "Scheduled Today",
      value: scheduledToday,
      icon: CalendarDays,
      color: "text-amber-600",
      bg: "bg-amber-50",
      href: "/app/schedule",
    },
    {
      label: "Outstanding",
      value: `$${(Number(unpaidInvoices._sum.total) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: "text-violet-600",
      bg: "bg-violet-50",
      href: "/app/invoices",
    },
    {
      label: "Revenue (MTD)",
      value: `$${(Number(monthPayments._sum.amount) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: TrendingUp,
      color: "text-green-600",
      bg: "bg-green-50",
      href: "/app/invoices",
    },
  ];

  return (
    <div className="p-4 lg:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Link
          href="/app/jobs/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Job
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {s.label}
              </span>
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center`}>
                <s.icon size={15} className={s.color} />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.value}</p>
          </Link>
        ))}
      </div>

      {/* Booking requests banner */}
      {newBookings > 0 && (
        <Link
          href="/app/jobs?tab=bookings"
          className="flex items-center justify-between px-4 py-3 bg-green-50 border border-green-200 rounded-lg mb-6 hover:bg-green-100 transition-colors"
        >
          <p className="text-sm font-medium text-green-800">
            {newBookings} new booking {newBookings === 1 ? "request" : "requests"} waiting
          </p>
          <ArrowRight size={14} className="text-green-700" />
        </Link>
      )}

      {/* Recent jobs */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Recent Jobs</h2>
          <Link href="/app/jobs" className="text-sm text-green-600 hover:underline font-medium">
            View all
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Briefcase size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No jobs yet.</p>
            <Link
              href="/app/jobs/new"
              className="mt-3 inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
            >
              <Plus size={13} />
              Create your first job
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentJobs.map((job) => (
              <Link
                key={job.id}
                href={`/app/jobs/${job.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    #{job.jobNumber} — {job.title}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {job.contact.firstName} {job.contact.lastName}
                    {job.scheduledAt &&
                      ` · ${new Date(job.scheduledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${statusColors[job.status]}`}
                >
                  {statusLabel[job.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        {[
          { href: "/app/jobs/new", label: "New Job" },
          { href: "/app/contacts/new", label: "New Contact" },
          { href: "/app/quotes", label: "New Quote" },
          { href: "/app/invoices", label: "New Invoice" },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Plus size={13} className="text-gray-400" />
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
