import { PrismaClient } from "@prisma/client";

/**
 * One-shot data fixup, run from the start script (this machine has no direct
 * access to the production DB): move the platform superadmin off the retired
 * streamflaremedia.com address so console sign-in codes reach a real inbox.
 * Idempotent — once no row matches the old address it does nothing — and it
 * never fails the boot: console access matters less than the site being up.
 */
const OLD_EMAIL = "admin@streamflaremedia.com";
const NEW_EMAIL = "info@streamflaire.com";

const prisma = new PrismaClient();
try {
  const taken = await prisma.user.findUnique({ where: { email: NEW_EMAIL } });
  if (taken) {
    console.log(`[superadmin-email] ${NEW_EMAIL} already belongs to user ${taken.id} — skipping.`);
  } else {
    const renamed = await prisma.user.updateMany({
      where: { email: OLD_EMAIL, role: "SUPERADMIN" },
      data: { email: NEW_EMAIL },
    });
    console.log(
      renamed.count > 0
        ? `[superadmin-email] renamed ${OLD_EMAIL} -> ${NEW_EMAIL}`
        : "[superadmin-email] nothing to rename."
    );
  }
} catch (err) {
  console.error("[superadmin-email] fixup failed (boot continues):", err);
} finally {
  await prisma.$disconnect();
}
