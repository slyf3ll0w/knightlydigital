/**
 * Pre-flight for the website a business puts on its texting registration.
 * The carrier reviewers load the site and match it to the business name; a
 * dead or unrelated site is a rejection, and every re-file is a fee. So the
 * check the reviewer will do runs here first, before anything is filed.
 *
 * The URL is user-supplied and fetched server-side, so it is treated as
 * hostile: http(s) only, public hostnames only (every hop of a redirect is
 * resolved and checked against private ranges), a short timeout and a capped
 * body.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const TIMEOUT_MS = 8_000;
const MAX_BODY = 500_000;
const MAX_HOPS = 4;

/** Words that don't identify a business on its own page. */
const STOP = new Set([
  "llc", "inc", "corp", "corporation", "company", "co", "ltd", "limited", "llp", "pllc", "group", "holdings",
  "services", "service", "the", "and", "of", "for", "solutions", "enterprises", "enterprise", "partners", "associates",
]);

/** Why a URL can't be checked at all (before any network), or null. Pure. */
export function websiteUrlIssue(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "Enter a valid website address.";
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return "The website must start with http:// or https://.";
  const host = u.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || isIP(host) || !host.includes(".")) {
    return "Use the business's public website address.";
  }
  return null;
}

/** Private / loopback / link-local ranges a server must never fetch. Pure. */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === "::1" || s === "::") return true;
    if (s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb")) return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true;
}

/** The distinctive words of a business name — what the page has to contain. Pure. */
export function nameTokens(names: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const n of names) {
    for (const w of (n ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/)) {
      if (w.length >= 4 && !STOP.has(w)) out.add(w);
    }
  }
  return [...out];
}

/** Does the page text mention the business? Any distinctive word counts; a name with none passes. Pure. */
export function mentionsBusiness(pageText: string, names: Array<string | null | undefined>): boolean {
  const tokens = nameTokens(names);
  if (tokens.length === 0) return true;
  const text = pageText.toLowerCase();
  return tokens.some((t) => text.includes(t));
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
}

async function hostIsPublic(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isPrivateIp(a.address));
  } catch {
    return false;
  }
}

export type WebsiteCheck = { ok: true } | { ok: false; reason: string };

/**
 * Load the site the way a reviewer would and confirm it's up and mentions
 * the business. `required` (toll-free) drops the "or leave it blank" advice.
 */
export async function checkBusinessWebsite(
  url: string,
  names: Array<string | null | undefined>,
  opts: { required?: boolean } = {}
): Promise<WebsiteCheck> {
  const orBlank = opts.required ? "" : " Or leave the website blank — it's optional for a local number.";
  const issue = websiteUrlIssue(url);
  if (issue) return { ok: false, reason: issue };

  let current = new URL(url);
  let res: Response | null = null;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const host = current.hostname.toLowerCase();
    if (websiteUrlIssue(current.toString()) || !(await hostIsPublic(host))) {
      return { ok: false, reason: `We couldn't reach ${host} — check the spelling.${orBlank}` };
    }
    try {
      res = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": "WorkBenchBot/1.0 (+https://workbenchfsm.com)", Accept: "text/html,*/*;q=0.5" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return { ok: false, reason: `${host} didn't answer — the reviewer will see the same.${orBlank}` };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || hop === MAX_HOPS) return { ok: false, reason: `${host} keeps redirecting — the reviewer can't load it either.${orBlank}` };
      current = new URL(loc, current);
      continue;
    }
    break;
  }
  if (!res) return { ok: false, reason: `We couldn't load ${current.hostname}.${orBlank}` };
  const host = current.hostname;
  if (!res.ok) {
    return { ok: false, reason: `${host} answered with an error (HTTP ${res.status}) — the reviewer will see the same. Fix the site first.${orBlank}` };
  }
  let html = "";
  try {
    html = (await res.text()).slice(0, MAX_BODY);
  } catch {
    return { ok: false, reason: `${host} didn't finish loading.${orBlank}` };
  }
  if (!mentionsBusiness(stripHtml(html), names)) {
    const shown = (names.find((n) => n && n.trim()) ?? "the business name") as string;
    return {
      ok: false,
      reason: `${host} loads, but we couldn't find "${shown}" on it. The reviewer matches the site to the business name — use a page that shows your name.${orBlank}`,
    };
  }
  return { ok: true };
}
