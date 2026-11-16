import { prisma } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { sendEmail, setupNudgeEmail, stalledSignupEmail } from "@/lib/email";
import { operatorEmail } from "@/lib/ops-alert";
import { paymentsSetupRequired } from "@/lib/payments-gate";
import { NUDGE_AFTER_HOURS, NUDGE_EPOCH, NUDGE_WINDOW_DAYS, nudgeReason } from "@/lib/setup-call";

/**
 * The stalled-sign-up nudge (David 2026-11-16: "I'm worried about a
 * self-serve client getting stuck"). A stuck person rarely clicks a help
 * link; they leave. So two days after sign-up, a company that is still held
 * at the payment-setup step, or is in the app with no client added, gets ONE
 * email offering the free setup call, and the operator gets one naming who
 * stalled and how to reach them.
 *
 * Once per company, ever: `Company.setupNudgeSentAt` is claimed with a
 * conditional update BEFORE the send, so two overlapping ticks can't both
 * email. A send that then fails is not retried: a missed nudge costs less
 * than a doubled one. Who qualifies is pure (lib/setup-call.ts nudgeReason,
 * scripts/test-setup-nudge.ts). Email only, no text.
 */
export async function runSetupNudgeSweep(now: Date): Promise<number> {
  const newest = new Date(now.getTime() - NUDGE_AFTER_HOURS * 3_600_000);
  const windowStart = new Date(now.getTime() - NUDGE_WINDOW_DAYS * 86_400_000);
  const oldest = windowStart > NUDGE_EPOCH ? windowStart : NUDGE_EPOCH;
  if (oldest > newest) return 0;

  const companies = await prisma.company.findMany({
    where: {
      setupNudgeSentAt: null,
      isTest: false,
      isPlatform: false,
      suspendedAt: null,
      createdAt: { gte: oldest, lte: newest },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      createdAt: true,
      timezone: true,
      setupNudgeSentAt: true,
      isTest: true,
      isPlatform: true,
      suspendedAt: true,
      paymentsRequiredAt: true,
      paymentsWaived: true,
      squareMerchantId: true,
      squareConnectedAt: true,
    },
  });

  let sent = 0;
  for (const c of companies) {
    try {
      const clients = await prisma.contact.count({ where: { companyId: c.id, placeholder: false } });
      const reason = nudgeReason(
        {
          createdAt: c.createdAt,
          setupNudgeSentAt: c.setupNudgeSentAt,
          isTest: c.isTest,
          isPlatform: c.isPlatform,
          suspended: c.suspendedAt != null,
          paymentsHeld: paymentsSetupRequired(c),
          clients,
        },
        now
      );
      if (!reason) continue;

      const owner = await prisma.user.findFirst({
        where: { companyId: c.id, role: "OWNER", isActive: true },
        orderBy: { createdAt: "asc" },
        select: { email: true, name: true, phone: true },
      });
      if (!owner?.email) continue;

      const claimed = await prisma.company.updateMany({
        where: { id: c.id, setupNudgeSentAt: null },
        data: { setupNudgeSentAt: now },
      });
      if (claimed.count === 0) continue;

      await sendEmail({ to: owner.email, ...setupNudgeEmail({ name: owner.name, companyName: c.name, reason }) });
      sent++;

      const operator = await operatorEmail();
      if (operator) {
        await sendEmail({
          to: operator,
          ...stalledSignupEmail({
            companyId: c.id,
            companyName: c.name,
            ownerName: owner.name,
            ownerEmail: owner.email,
            ownerPhone: owner.phone,
            reason,
            signedUp: c.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: c.timezone || "America/Chicago" }),
          }),
        });
      }
    } catch (e) {
      reportError("[setup-nudge] failed", { companyId: c.id, error: e });
    }
  }
  return sent;
}
