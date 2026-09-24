import type { Metadata } from "next";
import { requirePageActor, isManager } from "@/lib/permissions";
import Builder from "../Builder";

export const metadata: Metadata = { title: "New automation" };

/** /app/automations/new — an empty builder; `?atlas=1` puts the cursor in the Atlas box. */
export default async function NewAutomationPage({ searchParams }: { searchParams: Promise<{ atlas?: string }> }) {
  await requirePageActor((a) => isManager(a.role));
  const sp = await searchParams;
  return <Builder initial={null} initialRuns={[]} atlasFirst={sp.atlas === "1"} />;
}
