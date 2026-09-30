/** Pure formatting helpers shared by console server pages and client tables. */

export const usd = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

/** Sub-dollar platform costs (an account's AI month can be 3¢). */
export const usdFine = (cents: number) =>
  (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents !== 0 && Math.abs(cents) < 100 ? 3 : 2,
  });

export const compact = (n: number) => Intl.NumberFormat("en-US", { notation: "compact" }).format(n);

export const monthYear = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });

export const shortDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const fullDate = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;
