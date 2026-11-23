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
import { lookup as dnsLookup } from "node:dns";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { hostIsPublic, isPrivateIp } from "@/lib/website-check";

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

/**
 * One https request to a user-supplied address with the address check done
 * AT the connection: the name is resolved once, by a lookup that refuses
 * private addresses, and that same answer is what the socket connects to.
 * A check-then-fetch resolves the name twice, and a host that answers
 * "public" the first time and "10.0.0.5" the second walks straight past it
 * (DNS rebinding). No redirects are followed. Resolves to null when refused,
 * unreachable, timed out or (with maxBytes) too large.
 */
export function pinnedHttpsRequest(
  raw: string,
  opts: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {}
): Promise<{ status: number; text: string } | null> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return resolve(null);
    }
    if (url.protocol !== "https:" || url.username || url.password) return resolve(null);
    const maxBytes = opts.maxBytes ?? 64_000;
    let settled = false;
    const done = (v: { status: number; text: string } | null) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const req = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method: opts.method ?? "GET",
        headers: { ...(opts.headers ?? {}), ...(opts.body != null ? { "Content-Length": String(Buffer.byteLength(opts.body)) } : {}) },
        lookup: publicOnlyLookup,
        timeout: opts.timeoutMs ?? 5000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            req.destroy();
            return done(null);
          }
          chunks.push(c);
        });
        res.on("end", () => done({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", () => done(null));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      done(null);
    });
    req.on("error", () => done(null));
    if (opts.body != null) req.write(opts.body);
    req.end();
  });
}

/** dns.lookup that fails when any answer is a private address, so the socket can only reach a public one. */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  const literal = isIP(hostname);
  if (literal) {
    if (isPrivateIp(hostname)) return callback(new Error("private address"), "", literal);
    return (options as { all?: boolean }).all
      ? (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, [{ address: hostname, family: literal }])
      : callback(null, hostname, literal);
  }
  dnsLookup(hostname, { all: true }, (err, addrs) => {
    if (err) return callback(err, "", 4);
    if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) return callback(new Error("private address"), "", 4);
    if ((options as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: { address: string; family: number }[]) => void)(null, addrs);
    }
    callback(null, addrs[0].address, addrs[0].family);
  });
};
