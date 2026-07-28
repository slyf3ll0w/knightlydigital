// iOS back navigation on mobile: which pages count as subpages, what the
// back control is labeled, and where it lands when there's no history to pop.
// Used by the AppShell header control and the edge-swipe-back gesture.

// Longest prefix first so the settings sub-hubs win over /app/settings.
// `to` is the no-history fallback — deep links and notification taps land with
// nothing to pop, and some prefixes (appointments) have no list page of their own.
const backRoots: { prefix: string; label: string; to: string }[] = [
  { prefix: "/app/settings/products", label: "Services", to: "/app/settings/products" },
  { prefix: "/app/settings/contracts", label: "Contracts", to: "/app/settings/contracts" },
  { prefix: "/app/settings/booking", label: "Forms", to: "/app/settings/booking" },
  { prefix: "/app/settings/team", label: "Team", to: "/app/settings/team" },
  { prefix: "/app/settings", label: "Settings", to: "/app/settings" },
  { prefix: "/app/contacts", label: "Clients", to: "/app/contacts" },
  { prefix: "/app/requests", label: "Requests", to: "/app/requests" },
  { prefix: "/app/leads", label: "Leads", to: "/app/leads" },
  { prefix: "/app/quotes", label: "Quotes", to: "/app/quotes" },
  { prefix: "/app/jobs", label: "Jobs", to: "/app/jobs" },
  { prefix: "/app/appointments", label: "Schedule", to: "/app/schedule" },
  { prefix: "/app/invoices", label: "Invoices", to: "/app/invoices" },
  { prefix: "/app/payments", label: "Payments", to: "/app/payments" },
  { prefix: "/app/subscriptions", label: "Subscriptions", to: "/app/subscriptions" },
  { prefix: "/app/timesheets", label: "Timesheets", to: "/app/timesheets" },
  // No /app/contracts index — agreements belong to a contact
  { prefix: "/app/contracts", label: "Back", to: "/app/contacts" },
  { prefix: "/app/business", label: "Business", to: "/app/business" },
  { prefix: "/app/schedule", label: "Schedule", to: "/app/schedule" },
  { prefix: "/app/chat", label: "Chat", to: "/app/chat" },
];

export function mobileBackFor(pathname: string): { label: string; to: string } | null {
  for (const r of backRoots) {
    if (pathname !== r.prefix && pathname.startsWith(r.prefix + "/")) return r;
  }
  // Nested pages outside the map (e.g. /app/messages/[id]) still get a way out.
  if (pathname.startsWith("/app/") && pathname.split("/").filter(Boolean).length > 2)
    return { label: "Back", to: "/app/dashboard" };
  return null;
}
