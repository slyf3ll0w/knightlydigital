/**
 * Query params a placement sets on an embed's frame URL — `?theme=dark` /
 * `?match=0` from public/embed.js, or a look typed into the snippet by hand
 * (`?transparent=1&accent=…&font=…`), the owner's `?preview=1`, a share
 * link's `?src=`. The menu rows navigate INSIDE the frame, so every in-frame
 * link has to carry them: a dropped `match=0` re-enables style matching and a
 * dropped `theme=dark` renders the light form on a dark site until the host
 * message lands (a flash on every click). Pure; no React.
 */
export const EMBED_QUERY_KEYS = ["theme", "transparent", "accent", "font", "match", "preview", "src"] as const;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

/** The carried params as a query string ("?theme=dark&match=0"), or "" when there is nothing to carry. */
export function embedQuery(params: Params | null | undefined): string {
  if (!params) return "";
  const out = new URLSearchParams();
  for (const key of EMBED_QUERY_KEYS) {
    const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (typeof v === "string" && v !== "") out.set(key, v.slice(0, 80));
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}

/**
 * The auto-resize keys one frame answers to (EmbedAutoResize → the host's
 * `jobflow:height` listener): the current slug and every earlier one
 * (`Company.previousSlugs` — a snippet copied before a rename filters on the
 * slug it was copied with), each with the same path (item, estimate/tool).
 */
export function resizeKeys(slug: string, previousSlugs: string[] = [], path = ""): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [slug, ...previousSlugs]) {
    if (!s) continue;
    const key = path ? `${s}/${path}` : s;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** `href` with the carried query appended (merged into an existing query). */
export function withEmbedQuery(href: string, query: string): string {
  if (!query) return href;
  const q = query.startsWith("?") ? query.slice(1) : query;
  if (!q) return href;
  return href.includes("?") ? `${href}&${q}` : `${href}?${q}`;
}
