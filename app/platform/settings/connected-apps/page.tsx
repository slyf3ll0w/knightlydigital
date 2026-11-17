import { requirePageActor, isManager } from "@/lib/permissions";
import ConnectedAppsClient from "./ConnectedAppsClient";

export const dynamic = "force-dynamic";

/**
 * Settings → Connected apps: the AI apps (Claude, ChatGPT) connected to
 * this WorkBench account, what they prepared that is waiting for approval,
 * and how to connect one (docs/plans/workbench-connector-2026-11-17.md).
 * Owners and admins only, like the connections themselves.
 */
export default async function ConnectedAppsPage() {
  await requirePageActor((a) => isManager(a.role));
  return <ConnectedAppsClient />;
}
