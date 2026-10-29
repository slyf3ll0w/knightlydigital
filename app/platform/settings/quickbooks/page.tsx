import { prisma } from "@/lib/db";
import { requirePageActor, isManager } from "@/lib/permissions";
import { isQuickBooksConfigured } from "@/lib/quickbooks";
import { featureAllowedFor } from "@/lib/plan-gate";
import PlanRequired from "@/components/PlanRequired";
import QuickBooksSettingsClient from "./QuickBooksSettingsClient";

export const dynamic = "force-dynamic";

/**
 * Settings → QuickBooks: connect QBO, watch sync health, sync now.
 *
 * Plan gate: QuickBooks sync is Pro, but a company that already connected
 * keeps its connection and its nightly sync (grandfathered — the normal card
 * renders). Only a company with NO connection sees the upsell, and the
 * connect route (/api/app/quickbooks/connect) refuses with the same gate.
 */
export default async function QuickBooksSettingsPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const connected =
    (await prisma.quickBooksConnection.count({ where: { companyId: actor.companyId } })) > 0;
  if (!connected && !(await featureAllowedFor(actor.companyId, "quickbooks")))
    return <PlanRequired feature="quickbooks" back={{ href: "/app/settings", label: "Back to Settings" }} />;
  return <QuickBooksSettingsClient configured={isQuickBooksConfigured()} />;
}
