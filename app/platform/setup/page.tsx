import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import SetupWizardClient from "./SetupWizardClient";

/**
 * AI setup assistant (docs/plans/ai-setup-wizard-plan.md). Managers only —
 * it writes company-wide settings. Always reachable from Settings; the
 * dashboard card that points here hides once setupWizardAt is stamped.
 */
export default async function SetupPage() {
  const actor = await requirePageActor((a) => isManager(a.role));

  const [company, bookableCount] = await Promise.all([
    prisma.company.findUnique({
      where: { id: actor.companyId },
      select: {
        name: true,
        slug: true,
        industry: true,
        city: true,
        state: true,
        teamSize: true,
        timezone: true,
      },
    }),
    prisma.user.count({ where: { companyId: actor.companyId, isActive: true, bookable: true } }),
  ]);
  if (!company) return null;

  const serviceCount = await prisma.workItem.count({
    where: { companyId: actor.companyId, isActive: true, type: "SERVICE" },
  });

  return (
    <SetupWizardClient
      companyName={company.name}
      companySlug={company.slug}
      currentTimezone={company.timezone}
      serviceCount={serviceCount}
      bookableCount={bookableCount}
      prefill={{
        industry: company.industry ?? "",
        city: company.city ?? "",
        state: company.state ?? "",
        teamSize: company.teamSize ?? "",
      }}
    />
  );
}
