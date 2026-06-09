"use client";

import Link from "next/link";
import { CalendarDays, User, MapPin } from "lucide-react";

type Job = {
  id: string;
  jobNumber: number;
  title: string;
  status: string;
  scheduledAt: string | null;
  address: string | null;
  contact: { firstName: string; lastName: string };
  assignments: { user: { name: string } }[];
};

const COLUMNS: { status: string; label: string; color: string; dot: string }[] = [
  { status: "LEAD", label: "Lead", color: "bg-blue-50 border-blue-200", dot: "bg-blue-500" },
  { status: "SCHEDULED", label: "Scheduled", color: "bg-amber-50 border-amber-200", dot: "bg-amber-500" },
  { status: "IN_PROGRESS", label: "In Progress", color: "bg-orange-50 border-orange-200", dot: "bg-orange-500" },
  { status: "COMPLETE", label: "Complete", color: "bg-teal-50 border-teal-200", dot: "bg-teal-500" },
  { status: "INVOICED", label: "Invoiced", color: "bg-violet-50 border-violet-200", dot: "bg-violet-500" },
  { status: "PAID", label: "Paid", color: "bg-green-50 border-green-200", dot: "bg-green-500" },
];

export default function JobsBoard({ jobs }: { jobs: Job[] }) {
  const byStatus = (status: string) => jobs.filter((j) => j.status === status);

  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-400 text-sm mb-3">No jobs yet. Create your first job to get started.</p>
          <Link
            href="/app/jobs/new"
            className="inline-flex items-center gap-1 text-sm text-green-600 hover:underline font-medium"
          >
            + New Job
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 p-4 lg:p-6 min-w-max lg:min-w-0 lg:grid lg:grid-cols-6 h-full">
      {COLUMNS.map((col) => {
        const colJobs = byStatus(col.status);
        return (
          <div key={col.status} className="flex flex-col w-64 lg:w-auto min-w-0">
            {/* Column header */}
            <div className="flex items-center gap-2 mb-3 px-1">
              <div className={`w-2.5 h-2.5 rounded-full ${col.dot} shrink-0`} />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {col.label}
              </span>
              <span className="ml-auto text-xs text-gray-400 font-medium">{colJobs.length}</span>
            </div>

            {/* Cards */}
            <div className={`flex-1 rounded-lg border ${col.color} p-2 space-y-2 overflow-y-auto min-h-[120px]`}>
              {colJobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/app/jobs/${job.id}`}
                  className="block bg-white rounded border border-gray-200 p-3 hover:shadow-sm hover:border-gray-300 transition-all"
                >
                  <p className="text-xs text-gray-400 font-medium mb-0.5">#{job.jobNumber}</p>
                  <p className="text-sm font-semibold text-gray-900 leading-tight mb-1.5 line-clamp-2">
                    {job.title}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    {job.contact.firstName} {job.contact.lastName}
                  </p>
                  <div className="space-y-1">
                    {job.scheduledAt && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <CalendarDays size={10} />
                        {new Date(job.scheduledAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                    {job.address && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <MapPin size={10} />
                        <span className="truncate">{job.address}</span>
                      </div>
                    )}
                    {job.assignments.length > 0 && (
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <User size={10} />
                        {job.assignments.map((a) => a.user.name).join(", ")}
                      </div>
                    )}
                  </div>
                </Link>
              ))}

              {colJobs.length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-xs text-gray-300">Empty</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
