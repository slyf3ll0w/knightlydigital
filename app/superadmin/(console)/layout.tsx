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
  const [pending, feedback] = await Promise.all([
    prisma.accessApplication.count({ where: { status: "PENDING" } }),
    prisma.feedbackTicket.count({ where: { status: "OPEN" } }),
  ]);
  return (
    <ConsoleShell user={{ name: user.name, email: user.email }} counts={{ pending, feedback }}>
      {children}
      <ConfirmSheetHost />
    </ConsoleShell>
  );
}
