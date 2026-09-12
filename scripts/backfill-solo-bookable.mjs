// One-time backfill (safe to re-run): in every company with exactly ONE
// active member, flip that member's "takes bookings" switch on and put them
// on every booking item. `User.bookable` defaulted to off for everyone, and
// a booking item only copies whoever was bookable when it was created — so a
// one-person company that built its booking page first silently served a
// request form instead of open times. Signup now marks the owner bookable
// and the Team toggle joins existing items; this catches companies that
// signed up before. Runs as part of `npm run db:predeploy`.
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
    console.log("[backfill-solo-bookable] no one-person companies; nothing to do");
    return;
  }
  const soloUsers = await prisma.user.findMany({
    where: { isActive: true, companyId: { in: soloCompanyIds } },
    select: { id: true, companyId: true, bookable: true },
  });

  const flipped = await prisma.user.updateMany({
    where: { id: { in: soloUsers.filter((u) => !u.bookable).map((u) => u.id) } },
    data: { bookable: true },
  });

  let joined = 0;
  for (const u of soloUsers) {
    const types = await prisma.bookingType.findMany({
      where: { companyId: u.companyId },
      select: { id: true },
    });
    if (types.length === 0) continue;
    const res = await prisma.bookingTypeMember.createMany({
      data: types.map((t) => ({ bookingTypeId: t.id, userId: u.id })),
      skipDuplicates: true,
    });
    joined += res.count;
  }
  console.log(
    `[backfill-solo-bookable] ${soloUsers.length} one-person compan${soloUsers.length === 1 ? "y" : "ies"}: ${flipped.count} switched on, ${joined} booking-item membership${joined === 1 ? "" : "s"} added`
  );
}

main()
  .catch((e) => {
    console.error("[backfill-solo-bookable] failed", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
