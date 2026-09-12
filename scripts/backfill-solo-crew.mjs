// One-time backfill (safe to re-run): in every company with exactly ONE
// active member, put that member on every job nobody is assigned to (except
// outsourced work). Before lib/job-crew.ts auto-assigned solo operators, a
// one-person company's jobs were routinely left unassigned — so they never
// reached that person's Google Calendar / .ics feed. Runs as part of
// `npm run db:predeploy` (after db:push adds Job.outsourced).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const members = await prisma.user.groupBy({
    by: ["companyId"],
    where: { isActive: true, companyId: { not: null } },
    _count: { _all: true },
  });
  const soloCompanyIds = members.filter((m) => m._count._all === 1).map((m) => m.companyId);
  if (soloCompanyIds.length === 0) {
    console.log("[backfill-solo-crew] no one-person companies; nothing to do");
    return;
  }
  const soloUsers = await prisma.user.findMany({
    where: { isActive: true, companyId: { in: soloCompanyIds } },
    select: { id: true, companyId: true },
  });
  const userByCompany = new Map(soloUsers.map((u) => [u.companyId, u.id]));

  let assigned = 0;
  for (const [companyId, userId] of userByCompany) {
    const jobs = await prisma.job.findMany({
      where: { companyId, outsourced: false, assignments: { none: {} } },
      select: { id: true },
    });
    if (jobs.length === 0) continue;
    const res = await prisma.jobAssignment.createMany({
      data: jobs.map((j) => ({ jobId: j.id, userId })),
      skipDuplicates: true,
    });
    assigned += res.count;
  }
  console.log(
    `[backfill-solo-crew] ${userByCompany.size} one-person compan${userByCompany.size === 1 ? "y" : "ies"}, ${assigned} job${assigned === 1 ? "" : "s"} assigned`
  );
}

main()
  .catch((e) => {
    console.error("[backfill-solo-crew] failed", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
