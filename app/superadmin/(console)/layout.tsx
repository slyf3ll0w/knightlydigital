import { prisma } from "@/lib/db";
import { requireSuperadminPage } from "@/lib/superadmin";
import ConsoleShell from "@/components/console/ConsoleShell";
import ConfirmSheetHost from "@/components/ConfirmSheet";

/**
 * Platform-owner shell. Since 2026-09-30 it wears the tenant app's own
 * design system (components/console/ConsoleShell): rail, Lexend, .ds tokens,
 * dark theme — not the marketing site's language it used to borrow.
 */
export default async function SuperadminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSuperadminPage();
  const [pending, feedback, contact, leads] = await Promise.all([
    prisma.accessApplication.count({ where: { status: "PENDING" } }),
    prisma.feedbackTicket.count({ where: { status: "OPEN" } }),
    prisma.contactSubmission.count({ where: { spam: false, readAt: null } }),
    // Lead board: cards waiting in the first column (lib/console-leads.ts).
    prisma.consoleLeadStage
      .findFirst({ where: { isWon: false }, orderBy: { sortOrder: "asc" }, select: { id: true } })
      .then((s) => (s ? prisma.consoleLead.count({ where: { stageId: s.id, status: "OPEN" } }) : 0)),
  ]);
  return (
    <ConsoleShell user={{ name: user.name, email: user.email }} counts={{ pending, feedback, contact, leads }}>
      {children}
      <ConfirmSheetHost />
    </ConsoleShell>
  );
}
