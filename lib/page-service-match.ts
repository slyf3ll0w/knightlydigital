/**
 * Which service is this page about? (ticket #p8eoe2)
 *
 * A form embedded on a business's "Fence installation" page should arrive
 * with "Fence installation" already picked. The embed tells the form the
 * address and title of the page it sits on (public/embed.js, the
 * "jobflow:page" message); this picks the option that page names.
 *
 * Pure. The address is trusted first (a page's path is its topic; a title
 * often carries the company name and a tagline), then the title's first
 * part. An option matches when every meaningful word of its name is in the
 * text; when several match, the most specific (most words) wins, and a tie
 * picks nothing: a wrong guess is worse than an empty field.
 */

const STOP = new Set(["a", "an", "and", "the", "of", "for", "in", "on", "to", "our", "your", "with", "or", "service", "services", "new", "page"]);

/** "Fence Installations" → ["fence", "installation"] */
export function matchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

/** Words that mean the same thing on a service page: installs / installation / installing. */
function stem(w: string): string {
  return w.replace(/(ation|ing|ment|er)$/, "").replace(/e$/, "") || w;
}

function pick(names: string[], text: string): number {
  const have = new Set(matchWords(text).map(stem));
  if (have.size === 0) return -1;
  let best = -1;
  let bestSize = 0;
  let tie = false;
  names.forEach((name, i) => {
    const words = [...new Set(matchWords(name).map(stem))];
    if (words.length === 0 || !words.every((w) => have.has(w))) return;
    if (words.length > bestSize) {
      best = i;
      bestSize = words.length;
      tie = false;
    } else if (words.length === bestSize) {
      tie = true;
    }
  });
  return tie ? -1 : best;
}

/** The page's path as words: "/services/fence-installation/" → "services fence installation". */
function pathText(href: string): string {
  try {
    const u = new URL(href);
    return decodeURIComponent(u.pathname).replace(/\.[a-z0-9]{2,5}$/i, "");
  } catch {
    return "";
  }
}

/** The index of the option this page is about, or -1. */
export function matchServiceFromPage(names: string[], page: { href?: string | null; title?: string | null }): number {
  if (names.length === 0) return -1;
  const byPath = page.href ? pick(names, pathText(page.href)) : -1;
  if (byPath !== -1) return byPath;
  // "Fence Installation | Steadfast Outdoor Living" → the part before the site name
  const head = (page.title ?? "").split(/\s[|–—-]\s|\s·\s|:\s/)[0] ?? "";
  return head ? pick(names, head) : -1;
}

/** A typed ?service= / data-service value → the option it names (exact name first, then by words), or -1. */
export function matchServiceName(names: string[], wanted: string): number {
  const w = wanted.trim().toLowerCase();
  if (!w) return -1;
  const exact = names.findIndex((n) => n.trim().toLowerCase() === w);
  return exact !== -1 ? exact : pick(names, wanted);
}
