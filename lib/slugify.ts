/** "Lessly Holdings, LLC" → "lessly-holdings-llc" (lower-case, dashes, ≤60). Pure — safe in client bundles. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
