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

// Loose shape check: one @, something either side, no whitespace, and none
// of the characters that are never legal in an address. `%` matters most:
// `emailWhere` compiles to ILIKE, where % is a wildcard — an unescaped "%"
// used to match the oldest row in the whole table.
const EMAIL_SHAPE = /^[^\s@%,;<>()\\"/]+@[^\s@%,;<>()\\"/]+\.[^\s@%,;<>()\\"/]+$/;

/** Trim + lowercase + length-clamp an address for storage. "" if unusable. */
export function normalizeEmail(raw: unknown): string {
  const email = typeof raw === "string" ? raw.trim().toLowerCase().slice(0, 254) : "";
  return EMAIL_SHAPE.test(email) ? email : "";
}

/**
 * Where-clause for looking a user up by email, tolerant of legacy rows whose
 * stored casing differs. Pair with `orderBy: { createdAt: "asc" }` so a
 * pre-existing case-duplicate pair always resolves to the same account.
 */
export function emailWhere(email: string): Prisma.UserWhereInput {
  // `_` is legal in addresses but a single-char wildcard under ILIKE. Prisma
  // strips one level of backslash before the value reaches Postgres, so the
  // literal-underscore escape is `\\_` here (verified against prod). % never
  // gets this far — normalizeEmail rejects it.
  return { email: { equals: email.replace(/_/g, "\\\\_"), mode: "insensitive" } };
}
