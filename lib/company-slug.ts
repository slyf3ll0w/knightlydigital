import { prisma } from "@/lib/db";
import { slugify } from "@/lib/slugify";

export { slugify };

/**
 * The company's web address (`Company.slug`) and its history.
 *
 * Every public route is addressed by slug — /book/<slug>, /portal/<slug>,
 * /embed/<slug>, the public booking/estimate APIs — and the slug is in links
 * people have already shared (and in the URLs on file with the carrier
 * registry for texting). So a rename never breaks a link: the old slug goes
 * into `Company.previousSlugs`, every resolver below matches either, and the
 * page layouts redirect an old address to the current one.
 */

/** Prisma `where` that matches the current slug or any earlier one. */
export function slugWhere(slug: string) {
  return { OR: [{ slug }, { previousSlugs: { has: slug } }] };
}

/** The company at this slug (current or previous), full row. */
export function companyBySlug(slug: string) {
  return prisma.company.findFirst({ where: slugWhere(slug) });
}

/**
 * For a page layout: the current slug when `slug` is an old address that
 * should redirect, else null (current, or unknown — the page 404s itself).
 */
export async function canonicalSlugFor(slug: string): Promise<string | null> {
  const row = await prisma.company.findFirst({ where: slugWhere(slug), select: { slug: true } });
  return row && row.slug !== slug ? row.slug : null;
}

/** `/book/old-name/privacy` → `/book/new-name/privacy` (first segment after the prefix). */
export function swapSlugInPath(path: string, from: string, to: string): string {
  return path.replace(new RegExp(`^(/[^/]+/)${escapeRe(from)}(?=/|$)`), `$1${to}`);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Slugs that are routes or platform words, never a company address. The
 * public tree has nothing else at /book/<x>, but a company called "app" or
 * "help" would still read as ours in a link.
 */
export const RESERVED_SLUGS = new Set([
  "app", "api", "help", "book", "embed", "portal", "hub", "pay", "quote", "contract", "message",
  "admin", "superadmin", "login", "register", "apply", "invite", "pricing", "features", "privacy",
  "terms", "sms-terms", "about", "contact", "status", "wb", "workbench", "www", "mail", "support",
]);

export type SlugCheck = { ok: true; slug: string } | { ok: false; error: string };

/**
 * Validate a requested web address for `companyId`: lower-case letters,
 * digits and dashes, 3–60 chars, not reserved, not another company's current
 * or previous address. Pure apart from the uniqueness query.
 */
export async function checkSlugChange(companyId: string, raw: unknown): Promise<SlugCheck> {
  const slug = slugify(String(raw ?? ""));
  if (slug.length < 3) return { ok: false, error: "Use at least 3 letters or numbers." };
  if (RESERVED_SLUGS.has(slug)) return { ok: false, error: "That address is reserved. Try another." };
  const taken = await prisma.company.findFirst({ where: { ...slugWhere(slug), NOT: { id: companyId } }, select: { id: true } });
  if (taken) return { ok: false, error: "That address is already in use. Try another." };
  return { ok: true, slug };
}

/**
 * Earlier web addresses that keep resolving after a rename: at most `max`,
 * and the ORIGINAL one (on QR codes, printed links and the texting filing)
 * is never evicted — the oldest plus the most recent (audit 2026-10-06, E2).
 * Pure.
 */
export function trimSlugHistory(history: string[], max = 20): string[] {
  if (history.length <= max) return history;
  return [history[0], ...history.slice(-(max - 1))];
}
