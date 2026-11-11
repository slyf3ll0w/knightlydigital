import type { Metadata } from "next";
import { requirePageActor } from "@/lib/permissions";
import { pendingRequestsForUser } from "@/lib/company-requests";
import RequestCompanyClient from "./RequestCompanyClient";

export const metadata: Metadata = { title: "Request a company" };
export const dynamic = "force-dynamic";

/**
 * /app/request-company — ask WorkBench support for another company on this
 * login (avatar menu → Request a company). Support approves it in the
 * console and the company appears in the menu (lib/company-requests.ts).
 */
export default async function RequestCompanyPage() {
  const actor = await requirePageActor();
  const pending = await pendingRequestsForUser(actor.id);
  return (
    <RequestCompanyClient
      initialPending={pending.map((r) => ({ id: r.id, companyName: r.companyName, createdAt: r.createdAt.toISOString() }))}
    />
  );
}
