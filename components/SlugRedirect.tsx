import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { canonicalSlugFor, swapSlugInPath } from "@/lib/company-slug";

/**
 * Server component for the slug-addressed public layouts (/book, /portal,
 * /embed): when the address is one of the company's EARLIER slugs
 * (Company.previousSlugs — the business renamed its web address in
 * Settings), send the visitor to the same page at the current slug. The
 * path comes from the `x-wb-path` header middleware sets, since layouts
 * can't see the URL; without the header (a route middleware doesn't match)
 * nothing happens and the page still resolves the old slug by itself.
 */
export default async function SlugRedirect({ slug, prefix }: { slug: string; prefix: "book" | "portal" | "embed" }) {
  const current = await canonicalSlugFor(slug);
  if (!current) return null;
  const h = await headers();
  const path = h.get("x-wb-path") ?? `/${prefix}/${slug}`;
  const query = h.get("x-wb-query");
  redirect(`${swapSlugInPath(path, slug, current)}${query ? `?${query}` : ""}`);
}
