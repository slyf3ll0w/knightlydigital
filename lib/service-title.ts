/**
 * Name a record after the price-book services picked for it — "Mow",
 * "Mow + Edge", "Mow + 2 more". Client-safe (no Prisma); the server's
 * deriveJobTitle in lib/job-crew.ts applies the same rule, so what the user
 * sees in the form is what the API stores.
 */
export function titleFromServices(names: (string | null | undefined)[]): string {
  const clean = names.map((n) => (n ?? "").trim()).filter(Boolean);
  if (clean.length === 0) return "";
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} + ${clean[1]}`;
  return `${clean[0]} + ${clean.length - 1} more`;
}
