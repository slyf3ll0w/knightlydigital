/**
 * Square Dashboard deep links (client-safe — no server imports). The bank
 * accounts page is where a seller links the account Square pays out to;
 * squareup.com/dashboard/bank-accounts 301s here (checked 2026-10-23).
 */
export const SQUARE_BANK_ACCOUNTS_URL = "https://app.squareup.com/dashboard/bank-accounts";

/**
 * Dashboard screens WorkBench deliberately does NOT rebuild (2026-10-28,
 * plan § 3): instant transfer and the deposit schedule are Square-account
 * settings, so the Payments page deep-links to them instead. (Gift cards were
 * built in on 2026-10-30; the Square Online and loyalty links were dropped the
 * same day — loyalty needs a Square subscription WorkBench doesn't promote.)
 * Paths are Square's published dashboard routes as of 2026-10-28 (NOT verified against a signed-in seller from
 * here — a signed-in check is owed); the dashboard sends an unknown path to
 * its home, so a stale one degrades to "open the Square dashboard", never to
 * an error page.
 * Sandbox sellers live on app.squareupsandbox.com (same paths).
 */
export const SQUARE_DASHBOARD_PATHS = {
  home: "/dashboard/",
  balance: "/dashboard/balance",
  instantTransfer: "/dashboard/balance/transfers",
  transferSchedule: "/dashboard/balance/settings",
  bankAccounts: "/dashboard/bank-accounts",
  transactions: "/dashboard/sales/transactions",
  disputes: "/dashboard/disputes",
  giftCards: "/dashboard/gift-cards",
} as const;
export type SquareDashboardScreen = keyof typeof SQUARE_DASHBOARD_PATHS;

export function squareDashboardUrl(screen: SquareDashboardScreen, environment: "sandbox" | "production" = "production"): string {
  const host = environment === "sandbox" ? "https://app.squareupsandbox.com" : "https://app.squareup.com";
  return `${host}${SQUARE_DASHBOARD_PATHS[screen]}`;
}
