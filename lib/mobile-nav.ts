// iOS back navigation on mobile: which pages count as subpages, what the
// back control is labeled, and where it lands when there's no history to pop.
// Used by the AppShell header control and the edge-swipe-back gesture.
//
// The label names the page you actually came FROM (AppShell tracks the
// previous in-app route and passes it in) — the old purely-prefix-based
// version said "‹ Settings" on every /app/settings/* page no matter how you
// got there. The prefix tables below are the fallback for deep links and
// notification taps, which arrive with nothing to pop.

/**
 * The tab bar's own destinations. These always show the settings gear: you
 * land on them cold, they're one tap away from anywhere, and the gear is the
 * only quick route into Settings on a phone.
 */
const TAB_ROOTS = new Set(["/app/dashboard", "/app/schedule"]);

/**
 * Dead-end screens — account state and credential flows. There is nowhere to
 * go back TO (the page you came from would just bounce you here again), so
 * they never get a back control.
 */
const STANDALONE = new Set([
  "/app/suspended",
  "/app/activate",
  "/app/forgot-password",
  "/app/reset-password",
]);

/**
 * Top-level destinations: the tab bar plus every row in the More sheet. They
 * never get a back control from the prefix map — but several are also linked
 * to from other pages (Settings lists Services / Contracts / Forms; the
 * scheduling card links Team), so when we know the route you arrived from
 * they still name it. The four settings sub-hubs belong in this list: they're
 * their own nav items, not children of the Settings page, which is why they
 * used to say "‹ Settings" no matter where you came from.
 */
const ROOTS = new Set([
  ...TAB_ROOTS,
  "/app/schedule/map",
  "/app/contacts",
  "/app/requests",
  "/app/leads",
  "/app/quotes",
  "/app/jobs",
  "/app/invoices",
  "/app/payments",
  "/app/subscriptions",
  "/app/timesheets",
  "/app/business",
  "/app/chat",
  "/app/support",
  "/app/roadmap",
  "/app/settings",
  "/app/settings/products",
  "/app/settings/contracts",
  "/app/settings/booking",
  "/app/settings/team",
]);

/**
 * What to CALL a page — used to name the screen you came from, and to name
 * the fallback destination. Longest prefix first so the settings sub-hubs
 * win over /app/settings.
 */
const LABELS: [prefix: string, label: string][] = [
  ["/app/settings/products", "Services"],
  ["/app/settings/contracts", "Contracts"],
  ["/app/settings/booking", "Booking & forms"],
  ["/app/settings/team", "Team"],
  ["/app/settings/profile", "My Profile"],
  ["/app/settings/pipeline", "Lead Pipeline"],
  ["/app/settings/client-fields", "Client Fields"],
  ["/app/settings/quickbooks", "QuickBooks"],
  ["/app/settings/import", "Import"],
  ["/app/settings", "Settings"],
  ["/app/dashboard", "Home"],
  ["/app/schedule/map", "Routes"],
  ["/app/schedule", "Schedule"],
  ["/app/appointments", "Appointments"],
  ["/app/contacts", "Clients"],
  ["/app/requests", "Requests"],
  ["/app/leads", "Leads"],
  ["/app/quotes", "Quotes"],
  ["/app/jobs", "Jobs"],
  ["/app/invoices", "Invoices"],
  ["/app/payments", "Payments"],
  ["/app/subscriptions", "Subscriptions"],
  ["/app/timesheets", "Timesheets"],
  ["/app/contracts", "Agreements"],
  ["/app/business", "Business"],
  ["/app/insights", "Insights"],
  ["/app/expenses", "Expenses"],
  ["/app/team-map", "Team Map"],
  ["/app/messages", "Messages"],
  ["/app/chat", "Chat"],
  ["/app/support", "Help"],
  ["/app/roadmap", "Roadmap"],
];

/**
 * Where a subpage lands with no history to pop, when that isn't simply its
 * own section's list page: pages that hang off a hub, and records that
 * belong to another entity.
 */
// Appointments and agreements now have their own index pages, so their
// subpages fall back to those lists like every other entity (no PARENTS
// override needed anymore).
const PARENTS: [prefix: string, to: string][] = [
  ["/app/insights", "/app/business"],
  ["/app/expenses", "/app/business"],
  ["/app/team-map", "/app/business"],
];

const matches = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(prefix + "/");

/** Human name for any /app page — null when we have no idea. */
export function mobileLabelFor(pathname: string): string | null {
  for (const [prefix, label] of LABELS) if (matches(pathname, prefix)) return label;
  return null;
}

/** The no-history fallback for a subpage: its hub, or its section's list. */
function fallbackFor(pathname: string): { label: string; to: string } | null {
  for (const [prefix, to] of PARENTS)
    if (matches(pathname, prefix)) return { label: mobileLabelFor(to) ?? "Back", to };
  // Otherwise: up to the section's own list page (/app/jobs/[id] → Jobs)
  for (const [prefix, label] of LABELS)
    if (pathname.startsWith(prefix + "/")) return { label, to: prefix };
  // Nested pages outside the map still get a way out.
  if (pathname.split("/").filter(Boolean).length > 2)
    return { label: "Back", to: "/app/dashboard" };
  return null;
}

/**
 * The mobile header's left control. `previous` is the in-app route the user
 * navigated here from (AppShell); when we have one, it names the control —
 * so a job opened off the calendar reads "‹ Schedule", not "‹ Jobs".
 * Returns null for tab roots and non-app pages, which show the gear instead.
 */
export function mobileBackFor(
  pathname: string,
  previous?: string | null
): { label: string; to: string } | null {
  if (!pathname.startsWith("/app/")) return null;
  if (TAB_ROOTS.has(pathname) || STANDALONE.has(pathname)) return null;
  // Arriving by POPPING out of a child (job detail → Jobs) isn't "coming
  // from" somewhere — that's the page you just left behind, not a way back.
  const cameFrom =
    previous && previous !== pathname && previous.startsWith("/app/") &&
    !previous.startsWith(pathname + "/")
      ? previous
      : null;
  if (cameFrom) {
    const label = mobileLabelFor(cameFrom);
    if (label) return { label, to: cameFrom };
  }
  return ROOTS.has(pathname) ? null : fallbackFor(pathname);
}
