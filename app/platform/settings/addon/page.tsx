import { redirect } from "next/navigation";

/**
 * Settings → Voice used to be the Livery-hosted upsell for the business-line
 * plan. Plans are now bought on Settings → Plans (lib/plan-billing.ts, through
 * WorkBench's Square account), where Voice is one card among the others.
 * Old links and bookmarks land there; `?checkout=done` from a Livery
 * checkout still arrives here and is simply dropped (the Livery webhook
 * stamps the entitlement on its own).
 */
export default function AddonPage() {
  redirect("/app/settings/plans");
}
