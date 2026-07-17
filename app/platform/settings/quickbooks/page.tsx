import { requirePageActor, isManager } from "@/lib/permissions";
import { isQuickBooksConfigured } from "@/lib/quickbooks";
import QuickBooksSettingsClient from "./QuickBooksSettingsClient";

export const dynamic = "force-dynamic";

/** Settings → QuickBooks: connect QBO, watch sync health, sync now. */
export default async function QuickBooksSettingsPage() {
  await requirePageActor((a) => isManager(a.role));
  return <QuickBooksSettingsClient configured={isQuickBooksConfigured()} />;
}
