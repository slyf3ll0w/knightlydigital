import type { Prisma } from "@prisma/client";

/**
 * Sign-in email handling.
 *
 * Email addresses are case-insensitive in practice, but Postgres (and so
 * User.email's unique index) is not. Every WRITE therefore stores the
 * lowercased address, and every LOOKUP goes through `emailWhere` — which
 * matches case-insensitively so accounts created before this was enforced
 * (stored as the owner typed them, e.g. "Dave@Company.com") can still sign
 * in, reset their password, and be caught by duplicate checks.
 *
 * The insensitive match can't use the btree index, but User holds one row per
 * team member across all tenants and every caller is rate-limited, so the
 * scan is not worth trading correctness for.
 */

/** Trim + lowercase + length-clamp an address for storage. "" if unusable. */
export function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "";
}

/**
 * Where-clause for looking a user up by email, tolerant of legacy rows whose
 * stored casing differs. Pair with `orderBy: { createdAt: "asc" }` so a
 * pre-existing case-duplicate pair always resolves to the same account.
 */
export function emailWhere(email: string): Prisma.UserWhereInput {
  return { email: { equals: email, mode: "insensitive" } };
}
