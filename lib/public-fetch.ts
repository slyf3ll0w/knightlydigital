/**
 * Server-side fetches of an address a tenant (or a stranger) supplied.
 *
 * Anything a person can type that the SERVER later requests is a way to
 * make it call hosts only the server can reach (the private network, a
 * metadata endpoint). Two guards live here (2026-11-23 security review):
 *
 *  - fetchPublicUrl: http(s) only, the host must resolve to public
 *    addresses, and every redirect hop is checked the same way.
 *  - isPushServiceEndpoint: a web-push subscription's endpoint must belong
 *    to a browser vendor's push service, since the server POSTs to it.
 */
import { hostIsPublic } from "@/lib/website-check";

const MAX_HOPS = 3;

/** GET a user-supplied URL, refusing private hosts on every hop. Null = refused or failed. */
export async function fetchPublicUrl(raw: string, opts: { timeoutMs?: number } = {}): Promise<Response | null> {
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 4000);
  let target = raw;
  try {
    for (let hop = 0; hop <= MAX_HOPS; hop++) {
      const url = new URL(target);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      if (url.username || url.password) return null;
      if (!(await hostIsPublic(url.hostname.replace(/^\[|\]$/g, "")))) return null;
      const res = await fetch(url, { redirect: "manual", signal });
      if (res.status < 300 || res.status >= 400) return res;
      const next = res.headers.get("location");
      if (!next) return null;
      target = new URL(next, url).toString();
    }
  } catch {
    return null;
  }
  return null;
}

/** Hosts of the push services browsers hand out (Chrome / Edge / Opera / Samsung = FCM, Firefox, Safari, Windows). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /(^|\.)push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];

/** Is this web-push endpoint a real push service? Pure. */
export function isPushServiceEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    if (url.port && url.port !== "443") return false;
    return PUSH_HOSTS.some((h) => h.test(url.hostname.toLowerCase()));
  } catch {
    return false;
  }
}
