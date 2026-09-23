import type { Metadata } from "next";
import { requirePageActor, isManager } from "@/lib/permissions";
import NewJobClient from "./NewJobClient";

export const metadata: Metadata = { title: "New Job" };

// The form is a client component (it reads ?contactId= / ?requestId= / ?date=
// from the URL and fetches its own lists), so this thin server page is the
// gate — the same rule the Jobs list uses for its New button. Without it a
// role the API would refuse still got the form, and the 401/403 its contacts
// fetch came back with crashed it.
export default async function NewJobPage() {
  await requirePageActor((a) => isManager(a.role) || a.role === "USER");
  return <NewJobClient />;
}
