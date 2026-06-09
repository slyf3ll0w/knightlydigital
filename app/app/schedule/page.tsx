import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const statusColors: Record<string, string> = {
  LEAD: "bg-blue-500",
  SCHEDULED: "bg-amber-500",
  IN_PROGRESS: "bg-orange-500",
  COMPLETE: "bg-teal-500",
  INVOICED: "bg-violet-500",
  PAID: "bg-green-500",
};

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const { year, month } = await searchParams;
  const now = new Date();
  const y = year ? parseInt(year) : now.getFullYear();
  const m = month ? parseInt(month) : now.getMonth();

  const startOfMonth = new Date(y, m, 1);
  const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59);

  const jobs = await prisma.job.findMany({
    where: {
      companyId,
      scheduledAt: { gte: startOfMonth, lte: endOfMonth },
    },
    include: { contact: true },
    orderBy: { scheduledAt: "asc" },
  });

  // Build calendar grid
  const firstDow = startOfMonth.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  const prevMonth = m === 0 ? `?year=${y - 1}&month=11` : `?year=${y}&month=${m - 1}`;
  const nextMonth = m === 11 ? `?year=${y + 1}&month=0` : `?year=${y}&month=${m + 1}`;

  // Group jobs by day
  const jobsByDay: Record<number, typeof jobs> = {};
  for (const job of jobs) {
    if (!job.scheduledAt) continue;
    const d = new Date(job.scheduledAt).getDate();
    if (!jobsByDay[d]) jobsByDay[d] = [];
    jobsByDay[d].push(job);
  }

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
        <Link
          href="/app/jobs/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Job
        </Link>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <Link href={prevMonth} className="p-2 hover:bg-gray-100 rounded transition-colors">
          <ChevronLeft size={18} className="text-gray-600" />
        </Link>
        <h2 className="text-lg font-bold text-gray-900">
          {MONTHS[m]} {y}
        </h2>
        <Link href={nextMonth} className="p-2 hover:bg-gray-100 rounded transition-colors">
          <ChevronRight size={18} className="text-gray-600" />
        </Link>
      </div>

      {/* Calendar grid */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {DAYS.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {(() => {
          const cells: React.ReactNode[] = [];
          let day = 1;

          // Leading empty cells
          for (let i = 0; i < firstDow; i++) {
            cells.push(<div key={`empty-${i}`} className="min-h-[80px] lg:min-h-[100px] p-1 bg-gray-50 border-r border-b border-gray-100" />);
          }

          for (let d = 1; d <= daysInMonth; d++) {
            const isToday = d === now.getDate() && m === now.getMonth() && y === now.getFullYear();
            const dayJobs = jobsByDay[d] ?? [];

            cells.push(
              <div
                key={d}
                className={`min-h-[80px] lg:min-h-[100px] p-1.5 border-r border-b border-gray-100 ${isToday ? "bg-green-50" : ""}`}
              >
                <span
                  className={`inline-flex w-6 h-6 items-center justify-center text-xs font-semibold rounded-full mb-1 ${
                    isToday ? "bg-green-500 text-white" : "text-gray-700"
                  }`}
                >
                  {d}
                </span>
                <div className="space-y-0.5">
                  {dayJobs.slice(0, 3).map((job) => (
                    <Link
                      key={job.id}
                      href={`/app/jobs/${job.id}`}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-white font-medium truncate ${statusColors[job.status]}`}
                    >
                      {job.contact.firstName.charAt(0)}. {job.contact.lastName} — {job.title}
                    </Link>
                  ))}
                  {dayJobs.length > 3 && (
                    <p className="text-xs text-gray-400 pl-1">+{dayJobs.length - 3} more</p>
                  )}
                </div>
              </div>
            );
            day++;
          }

          // Trailing empty cells to fill last week
          const total = firstDow + daysInMonth;
          const remainder = total % 7;
          if (remainder > 0) {
            for (let i = 0; i < 7 - remainder; i++) {
              cells.push(<div key={`trail-${i}`} className="min-h-[80px] lg:min-h-[100px] p-1 bg-gray-50 border-r border-b border-gray-100" />);
            }
          }

          return <div className="grid grid-cols-7">{cells}</div>;
        })()}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4">
        {Object.entries(statusColors).map(([s, c]) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-gray-500">
            <div className={`w-2.5 h-2.5 rounded ${c}`} />
            {s.replace("_", " ")}
          </div>
        ))}
      </div>
    </div>
  );
}
