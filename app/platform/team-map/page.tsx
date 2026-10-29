import type { Metadata } from "next";
import { requirePageActor, isManager } from "@/lib/permissions";
import { featureAllowedFor } from "@/lib/plan-gate";
import PlanRequired from "@/components/PlanRequired";
import TeamMapClient from "./TeamMapClient";

export const metadata: Metadata = { title: "Team Map" };

/**
 * Live team map (owners/admins): everyone currently clocked in, at their
 * freshest known position. Positions come from foreground pings while a tech
 * is on the clock — see TeamLocationReporter — so a locked phone shows its
 * last known spot with an age label rather than a live dot.
 */
export default async function TeamMapPage() {
  const actor = await requirePageActor((a) => isManager(a.role));
  if (!(await featureAllowedFor(actor.companyId, "team_map")))
    return <PlanRequired feature="team_map" back={{ href: "/app/business", label: "Back to the overview" }} />;
  return <TeamMapClient />;
}
