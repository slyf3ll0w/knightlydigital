/**
 * Server-side fetch of a business's PUBLIC website for the setup wizard:
 * plain text for AI drafting, plus branding candidates (logo image URL,
 * theme color). Fetches are SSRF-guarded (http/https only, no private
 * hosts), size-capped, and soft-fail to null — the wizard works without
 * a website, this just makes it better.
 */

export type WebsiteInfo = {
  url: string;
  title: string;
  description: string;
  /** Visible page text, whitespace-collapsed, capped for the AI prompt. */
  text: string;
  /** Best logo candidate, absolute URL (= logoCandidates[0]). */
  logoUrl: string | null;
  /** Ranked logo candidates (img-that-says-logo, og:image, big icons) — a
   *  vision check picks the first that's actually the business's mark. */
  logoCandidates: string[];
  /** <meta name="theme-color"> if present (#RRGGBB). */
  themeColor: string | null;
};

const MAX_HTML_BYTES = 800_000;
const MAX_TEXT_CHARS = 12_000;
export const MAX_LOGO_BYTES = 2 * 1024 * 1024;
export const LOGO_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Reject URLs that could reach internal services (SSRF). */
export function isSafePublicUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return false;
  // IPv6 literals and anything bracketed — not a public business site
  if (host.includes(":") || host.startsWith("[")) return false;
  // IPv4 literals: block private/reserved ranges (and just block all literals —
  // real business sites have hostnames)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  if (!host.includes(".")) return false;
  return true;
}

/** Normalize user/AI-supplied website strings ("acme.com") to a safe URL, or null. */
export function normalizeWebsiteUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim().slice(0, 300);
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  if (!isSafePublicUrl(s)) return null;
  try {
    const u = new URL(s);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? (m[2] ?? m[3] ?? "").trim() : null;
}

/** First <meta> whose name/property matches, returning its content. */
function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = (attr(tag, "name") ?? attr(tag, "property") ?? "").toLowerCase();
    if (name === key.toLowerCase()) {
      const content = attr(tag, "content");
      if (content) return decodeEntities(content);
    }
  }
  return null;
}

function resolveUrl(href: string, base: string): string | null {
  try {
    const abs = new URL(href, base).toString();
    return isSafePublicUrl(abs) ? abs : null;
  } catch {
    return null;
  }
}

/** Pure HTML → WebsiteInfo extraction (unit-testable without network). */
export function parseWebsiteHtml(html: string, baseUrl: string): WebsiteInfo {
  const title = decodeEntities(
    (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").trim()
  ).slice(0, 200);
  const description = (metaContent(html, "description") ?? metaContent(html, "og:description") ?? "")
    .slice(0, 500);

  // theme color — only accept a clean 6-digit hex
  const themeRaw = metaContent(html, "theme-color") ?? "";
  const themeColor = /^#[0-9a-fA-F]{6}$/.test(themeRaw) ? themeRaw.toUpperCase() : null;

  // logo candidates, best first: <img> tags that self-identify as the logo
  // (og:image is often a marketing banner, not the mark), then og:image,
  // then apple-touch-icon/large icon links (plain favicon.ico is too small).
  // Candidates are only HINTS — the lookup runs a vision check to pick the
  // first that's actually this business's mark (sites are full of partner
  // badges with "logo" in the filename).
  const logoCandidates: string[] = [];
  const addCandidate = (href: string | null | undefined) => {
    if (!href || href.startsWith("data:") || /\.svg(\?|$)/i.test(href)) return;
    const abs = resolveUrl(href, baseUrl);
    if (abs && !logoCandidates.includes(abs)) logoCandidates.push(abs);
  };
  {
    const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
    const scored: { href: string; score: number; order: number }[] = [];
    imgs.slice(0, 200).forEach((tag, order) => {
      const src = attr(tag, "src");
      if (!src) return;
      const alt = (attr(tag, "alt") ?? "").toLowerCase();
      const cls = (attr(tag, "class") ?? "") + " " + (attr(tag, "id") ?? "");
      let score = 0;
      if (/logo/i.test(src)) score += 100;
      if (alt.includes("logo")) score += 80;
      if (/logo/i.test(cls)) score += 60;
      if (score > 0) scored.push({ href: src, score, order });
    });
    // header logos come first in the document — earlier wins a score tie
    scored.sort((a, b) => b.score - a.score || a.order - b.order);
    for (const s of scored.slice(0, 2)) addCandidate(s.href);
  }
  addCandidate(metaContent(html, "og:image"));
  {
    const links = html.match(/<link\b[^>]*>/gi) ?? [];
    let best: { href: string; score: number } | null = null;
    for (const tag of links) {
      const rel = (attr(tag, "rel") ?? "").toLowerCase();
      const href = attr(tag, "href");
      if (!href || !rel.includes("icon")) continue;
      const sizes = attr(tag, "sizes") ?? "";
      const size = Number(/(\d+)x\d+/.exec(sizes)?.[1] ?? 0);
      const score = rel.includes("apple-touch") ? 180 : size;
      if (score >= 96 && (!best || score > best.score)) best = { href, score };
    }
    if (best) addCandidate(best.href);
  }
  const logoUrl = logoCandidates[0] ?? null;

  // visible text: drop non-content blocks, then all tags, collapse whitespace
  const text = decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_CHARS);

  return { url: baseUrl, title, description, text, logoUrl, logoCandidates, themeColor };
}

/**
 * Fetch + parse a public website's homepage. Null on any failure.
 * Retries with the www./apex variant toggled — AI lookups and owners cite
 * whichever spelling they remember, and plenty of small-business domains
 * only resolve one of them (live case: www.excellentpcbuilding.com is
 * ENOTFOUND while the apex serves the real site).
 */
export async function fetchWebsiteInfo(rawUrl: string): Promise<WebsiteInfo | null> {
  const url = normalizeWebsiteUrl(rawUrl);
  if (!url) return null;
  const first = await fetchWebsiteInfoOnce(url);
  if (first) return first;
  try {
    const u = new URL(url);
    u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
    const alt = u.toString();
    if (isSafePublicUrl(alt)) return await fetchWebsiteInfoOnce(alt);
  } catch {
    // toggle is best-effort
  }
  return null;
}

async function fetchWebsiteInfoOnce(url: string): Promise<WebsiteInfo | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StreamflaireHub-Setup/1.0)" },
    });
    if (!res.ok) return null;
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("text/html")) return null;
    // final URL after redirects is the base for relative links — but only if
    // it's still a safe public host
    const finalUrl = isSafePublicUrl(res.url) ? res.url : url;
    const buf = await res.arrayBuffer();
    const html = Buffer.from(buf.slice(0, MAX_HTML_BYTES)).toString("utf8");
    return parseWebsiteHtml(html, finalUrl);
  } catch {
    return null;
  }
}

/**
 * Download a logo image candidate (setup-wizard branding apply). Returns the
 * bytes + mime, or null when missing/too big/not a supported image type.
 */
export async function fetchLogoImage(
  rawUrl: string
): Promise<{ bytes: Buffer; mime: string } | null> {
  if (!isSafePublicUrl(rawUrl)) return null;
  try {
    const res = await fetch(rawUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; StreamflaireHub-Setup/1.0)" },
    });
    if (!res.ok) return null;
    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!LOGO_MIMES.includes(mime)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_LOGO_BYTES) return null;
    return { bytes: buf, mime };
  } catch {
    return null;
  }
}
