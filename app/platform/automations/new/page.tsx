import type { Metadata } from "next";
import { requirePageActor, isManager } from "@/lib/permissions";
import { featureAllowedFor } from "@/lib/plan-gate";
import PlanRequired from "@/components/PlanRequired";
import Builder from "../Builder";

export const metadata: Metadata = { title: "New automation" };

/** /app/automations/new — an empty builder; `?atlas=1` puts the cursor in the Atlas box; `?ask=` pre-fills it (the list's example flows). */
export default async function NewAutomationPage({ searchParams }: { searchParams: Promise<{ atlas?: string; ask?: string }> }) {
  const actor = await requirePageActor((a) => isManager(a.role));
  if (!(await featureAllowedFor(actor.companyId, "automations")))
    return <PlanRequired feature="automations" back={{ href: "/app/dashboard", label: "Back to Home" }} />;
  const sp = await searchParams;
  return <Builder initial={null} initialRuns={[]} atlasFirst={sp.atlas === "1"} initialAsk={typeof sp.ask === "string" ? sp.ask.slice(0, 500) : ""} />;
}
