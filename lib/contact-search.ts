import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Free-text search over clients and leads.
 *
 * Everything a company can record about a contact is searchable: the built-in
 * columns, and the company's own custom fields ("Date added", "Gate code").
 * Custom field values live in a Json blob keyed by definition id, which
 * Prisma's filter API can't ILIKE across, so those ids come from one narrow
 * raw query and fold back into the main filter as an `id IN (...)` branch.
 * That keeps every permission scope (contactScope, status, assignee) on the
 * findMany where it belongs — the raw query only ever narrows.
 */

// Callers concatenate this into ILIKE patterns, so the user's own % and _ have
// to stop being wildcards. Backslash is the escape, so it goes first.
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Contacts whose custom field values, or whose digits-only phone, match. */
async function jsonAndPhoneMatches(companyId: string, q: string): Promise<string[]> {
  const pattern = `%${escapeLike(q)}%`;
  const digits = q.replace(/\D/g, "");
  // A one- or two-digit search would match nearly every phone number, so the
  // phone branch only opens once there's enough to be a real lookup.
  const phonePattern = digits.length >= 3 ? `%${digits}%` : null;

  // The type guard belongs inside the lateral, not the WHERE: jsonb_each_text
  // raises on a non-object, and the join expands rows before WHERE filters
  // them. A stray scalar in customFields would otherwise 500 the whole search.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT DISTINCT c.id
    FROM "Contact" c
    LEFT JOIN LATERAL jsonb_each_text(
      CASE WHEN jsonb_typeof(c."customFields") = 'object'
           THEN c."customFields" ELSE '{}'::jsonb END
    ) kv ON TRUE
    WHERE c."companyId" = ${companyId}
      AND (
        kv.value ILIKE ${pattern}
        OR (
          ${phonePattern}::text IS NOT NULL
          AND regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE ${phonePattern}
        )
      )
    LIMIT 1000
  `;
  return rows.map((r) => r.id);
}

/**
 * The OR branch for a search term, or undefined for an empty one. Await this
 * and spread it into a contact `where`.
 */
export async function contactSearchWhere(
  companyId: string,
  raw: string | undefined
): Promise<Prisma.ContactWhereInput | undefined> {
  const q = raw?.trim();
  if (!q) return undefined;

  const like = { contains: q, mode: "insensitive" as const };
  const or: Prisma.ContactWhereInput[] = [
    { firstName: like },
    { lastName: like },
    { companyName: like },
    { email: like },
    { phone: { contains: q } },
    { address: like },
    { city: like },
    { state: like },
    { zip: like },
    { notes: like },
    { leadSource: like },
  ];

  // "Jane Rivera" matches nothing above — each column holds only half of it.
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const first = words.slice(0, -1).join(" ");
    const last = words[words.length - 1];
    or.push({
      AND: [
        { firstName: { contains: first, mode: "insensitive" } },
        { lastName: { contains: last, mode: "insensitive" } },
      ],
    });
  }

  const ids = await jsonAndPhoneMatches(companyId, q);
  if (ids.length > 0) or.push({ id: { in: ids } });

  return { OR: or };
}
