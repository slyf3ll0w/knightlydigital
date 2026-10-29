import type { Metadata } from "next";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { requirePageActor, isManager } from "@/lib/permissions";
import { planGatingLive } from "@/lib/plans";
import { planBillingState } from "@/lib/plan-billing";
import PlansClient from "./PlansClient";

export const metadata: Metadata = { title: "Plans" };
export const dynamic = "force-dynamic";

/**
 * Settings → Plans: what the company is on, the plans it could add (Voice,
 * Pro, Max; Gallery coming soon), extra people, and the card on file — all
 * billed through WorkBench's own Square account (lib/plan-billing.ts).
 * Managers can look; the owner acts. Replaces the Voice-only
 * /app/settings/addon page (which redirects here).
 */
export default async function PlansPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  const state = await planBillingState(actor.companyId, planGatingLive());
  return (
    <div className="ds mx-auto max-w-4xl p-4 lg:p-8">
      <div className="mb-5 flex items-start gap-3">
        <BackLink href="/app/settings" className="mt-1.5" />
        <PageTitle info="Core is free. Add Voice for a business phone line, Pro for unlimited people and the ops tools, or Max for both. Billed monthly or annually through Square; cancel any time and the plan runs to the end of what you paid for.">
          Plans
        </PageTitle>
      </div>
      <PlansClient initial={state} isOwner={actor.role === "OWNER"} />
    </div>
  );
}
