import type { Metadata } from "next";
import { requirePageActor, canSell } from "@/lib/permissions";
import NewRequestClient from "./NewRequestClient";

export const metadata: Metadata = { title: "New Request" };

// The form is a client component (it reads ?contactId= from the URL and
// fetches its own contacts), so this thin server page is the gate — the same
// rule the Requests list and the requests API use. Without it a role the API
// would refuse still got the form, and the 401/403 its contacts fetch came
// back with crashed it.
export default async function NewRequestPage() {
  await requirePageActor((a) => canSell(a.role));
  return <NewRequestClient />;
}
