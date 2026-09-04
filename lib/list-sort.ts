/**
 * List ordering, decided once for every list page.
 *
 * Before this, Jobs and Clients sorted by `updatedAt` (editing a record hopped
 * it to the top of the list — the order read as random) while Quotes,
 * Invoices and Requests sorted by `createdAt`. Now every list has a named
 * default a user can predict, plus a `?sort=` param the FilterBar exposes.
 *
 * The first option in each list is the default. Unknown/absent values fall
 * back to it, so a stale link never throws.
 */

export type SortOption = { value: string; label: string };

export function pickSort(raw: string | undefined, options: readonly SortOption[]): string {
  const v = raw ?? "";
  return options.some((o) => o.value === v) ? v : options[0].value;
}

/** Jobs — soonest scheduled first, unscheduled pinned to the top so they
 *  can't hide at the bottom of a long list. */
export const JOB_SORTS = [
  { value: "schedule", label: "By schedule" },
  { value: "newest", label: "Newest first" },
  { value: "updated", label: "Last updated" },
  { value: "client", label: "Client A–Z" },
] as const satisfies readonly SortOption[];

export function jobOrderBy(sort: string) {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" as const }];
    case "updated":
      return [{ updatedAt: "desc" as const }];
    case "client":
      return [
        { contact: { lastName: "asc" as const } },
        { contact: { firstName: "asc" as const } },
        { scheduledAt: "asc" as const },
      ];
    default:
      return [
        { scheduledAt: { sort: "asc" as const, nulls: "first" as const } },
        { createdAt: "desc" as const },
      ];
  }
}

/** Clients — alphabetical, the order people expect from an address book. */
export const CLIENT_SORTS = [
  { value: "name", label: "Name A–Z" },
  { value: "newest", label: "Newest first" },
  { value: "updated", label: "Last updated" },
] as const satisfies readonly SortOption[];

export function clientOrderBy(sort: string) {
  switch (sort) {
    case "newest":
      return [{ createdAt: "desc" as const }];
    case "updated":
      return [{ updatedAt: "desc" as const }];
    default:
      return [{ lastName: "asc" as const }, { firstName: "asc" as const }];
  }
}

/** Quotes — newest first (a quote's life is short; the latest is the one
 *  being worked). */
export const QUOTE_SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "amount", label: "Highest amount" },
  { value: "client", label: "Client A–Z" },
] as const satisfies readonly SortOption[];

export function quoteOrderBy(sort: string) {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" as const }];
    case "amount":
      return [{ total: "desc" as const }, { createdAt: "desc" as const }];
    case "client":
      return [
        { contact: { lastName: "asc" as const } },
        { contact: { firstName: "asc" as const } },
        { createdAt: "desc" as const },
      ];
    default:
      return [{ createdAt: "desc" as const }];
  }
}

/** Invoices — newest first by default; "Due soonest" is the collections view. */
export const INVOICE_SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "due", label: "Due soonest" },
  { value: "amount", label: "Highest amount" },
  { value: "client", label: "Client A–Z" },
] as const satisfies readonly SortOption[];

export function invoiceOrderBy(sort: string) {
  switch (sort) {
    case "due":
      return [
        { dueDate: { sort: "asc" as const, nulls: "last" as const } },
        { createdAt: "desc" as const },
      ];
    case "amount":
      return [{ total: "desc" as const }, { createdAt: "desc" as const }];
    case "client":
      return [
        { contact: { lastName: "asc" as const } },
        { contact: { firstName: "asc" as const } },
        { createdAt: "desc" as const },
      ];
    default:
      return [{ createdAt: "desc" as const }];
  }
}

/** Requests — newest first (an inbox). */
export const REQUEST_SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "preferred", label: "Preferred date" },
] as const satisfies readonly SortOption[];

export function requestOrderBy(sort: string) {
  switch (sort) {
    case "oldest":
      return [{ createdAt: "asc" as const }];
    case "preferred":
      return [
        { preferredDate: { sort: "asc" as const, nulls: "last" as const } },
        { createdAt: "desc" as const },
      ];
    default:
      return [{ createdAt: "desc" as const }];
  }
}
