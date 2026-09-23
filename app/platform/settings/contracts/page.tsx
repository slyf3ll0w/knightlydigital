import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Agreements — Templates" };

/**
 * Agreement templates moved onto the Agreements page itself
 * (/app/contracts?view=templates) so one page owns both what's been sent
 * and what it starts from. Old links and the Settings index still land here.
 */
export default function ContractTemplatesPage() {
  redirect("/app/contracts?view=templates");
}
