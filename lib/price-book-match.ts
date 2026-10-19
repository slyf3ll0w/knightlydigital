/**
 * Fuzzy lookup of a typed service/product name against the price book —
 * how Atlas prices a line item the user named by ear ("add a Wter Heater
 * Replacement to today's job") without asking what it costs (David
 * 2026-10-19). Pure — unit-tested in scripts/test-price-book-match.ts.
 *
 * Scoring: an exact (normalised) name wins outright; one name containing
 * the other is next; otherwise the share of query words found in the name
 * (a word matches when it is equal, a prefix, or within a typo or two).
 * `best` is only set when one entry clearly leads — "water heater" against
 * both "Water Heater Replacement" and "Water Heater Flush" stays open, and
 * the caller shows `close` so the user can pick.
 */

export type MatchResult<T> = { best: T | null; close: T[] };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const STOP = new Set(["a", "an", "the", "of", "and", "for", "to", "with", "new"]);
const words = (s: string) => norm(s).split(" ").filter((w) => w && !STOP.has(w));

/** Damerau-free Levenshtein, small strings only. */
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function wordMatches(q: string, w: string): boolean {
  if (q === w) return true;
  if (q.length >= 4 && (w.startsWith(q) || q.startsWith(w)) && Math.min(q.length, w.length) >= 4) return true;
  const tolerance = q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
  return tolerance > 0 && Math.abs(q.length - w.length) <= tolerance && editDistance(q, w) <= tolerance;
}

/** 0..1 — how well `query` names `name`. */
export function nameScore(query: string, name: string): number {
  const q = norm(query);
  const n = norm(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  const qw = words(query);
  const nw = words(name);
  if (qw.length === 0 || nw.length === 0) return 0;
  // One naming the other, as long as the shorter side is at least half of
  // the longer — "drain" names "Drain Cleaning", "install" alone does not
  // name "Garbage Disposal Install".
  if ((n.includes(q) || q.includes(n)) && Math.min(qw.length, nw.length) / Math.max(qw.length, nw.length) >= 0.5) return 0.9;
  let hit = 0;
  for (const w of qw) if (nw.some((x) => wordMatches(w, x))) hit++;
  // Typo-tolerant word overlap, scaled by how many words either side has
  return (hit / Math.max(qw.length, nw.length)) * 0.85;
}

export function matchPriceBook<T extends { name: string }>(query: string, book: T[]): MatchResult<T> {
  const scored = book
    .map((entry) => ({ entry, score: nameScore(query, entry.name) }))
    .filter((s) => s.score >= 0.3)
    .sort((a, b) => b.score - a.score);
  const close = scored.slice(0, 4).map((s) => s.entry);
  if (scored.length === 0) return { best: null, close };
  const [first, second] = scored;
  const clear = first.score >= 0.6 && (!second || second.score < first.score - 0.15 || first.score === 1);
  return { best: clear ? first.entry : null, close };
}
