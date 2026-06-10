import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/db";
import Link from "next/link";
import { Plus } from "lucide-react";
import JobsBoard from "./JobsBoard";

export default async function JobsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/app/login");

  const companyId = session.user.companyId;
  if (!companyId) redirect("/app/register");

  const jobs = await prisma.job.findMany({
    where: { companyId },
    include: {
      contact: true,
      assignments: { include: { user: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 lg:px-8 py-5 border-b border-gray-100 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500">{jobs.length} total</p>
        </div>
        <Link
          href="/app/jobs/new"
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Plus size={15} />
          New Job
        </Link>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-auto">
        <JobsBoard jobs={JSON.parse(JSON.stringify(jobs))} />
      </div>
    </div>
  );
}
