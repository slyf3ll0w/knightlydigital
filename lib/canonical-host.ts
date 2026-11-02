/**
 * One public hostname per deployment (security audit 2026-11-01, finding 6).
 *
 * Production sits behind Cloudflare, and the per-visitor rate limits key off
 * the visitor address Cloudflare stamps on each request (lib/rate-limit.ts
 * clientIp). The Railway hostname underneath was reachable directly, where
 * those headers are whatever the caller types — so a login guesser or a
 * reset-email flooder could skip Cloudflare and rotate a fake address per
 * request. Every request for a hostname other than the deployment's own
 * (NEXTAUTH_URL) is sent to the real one: a 308 for reads so a stray link
 * still lands, a 421 for writes so nothing is processed off-host.
 *
 * Staging has no Cloudflare and NEXTAUTH_URL is its Railway hostname, so
 * nothing changes there; local dev matches localhost:3000. Pure — the
 * middleware (edge) and the unit test share it.
 */
export type HostVerdict =
  | { kind: "ok" }
  | { kind: "redirect"; location: string }
  | { kind: "refuse" };

type HostEnv = { NEXTAUTH_URL?: string; CANONICAL_HOST_ALIASES?: string };

/** The hostname (with port) the deployment answers to, or null when unconfigured. */
export function canonicalHost(env: HostEnv = process.env): string | null {
  const raw = env.NEXTAUTH_URL;
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Other hostnames that may still carry traffic and are ALSO behind the same
 * edge — an old domain whose webhook URLs are still configured somewhere,
 * for instance. Comma-separated in CANONICAL_HOST_ALIASES; never the
 * hosting provider's own hostname, which is the one this exists to close.
 */
export function hostAliases(env: HostEnv = process.env): string[] {
  return (env.CANONICAL_HOST_ALIASES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Compare the request's Host header with the canonical one. `pathAndQuery`
 * is kept on the redirect. Health probes and local dev loopbacks pass.
 */
export function hostVerdict(params: {
  requestHost: string | null | undefined;
  method: string;
  pathAndQuery: string;
  env?: HostEnv;
}): HostVerdict {
  const env = params.env ?? process.env;
  const canonical = canonicalHost(env);
  if (!canonical) return { kind: "ok" };
  const host = (params.requestHost ?? "").trim().toLowerCase();
  if (!host || host === canonical || hostAliases(env).includes(host)) return { kind: "ok" };
  // Local dev reaches the same server as localhost, 127.0.0.1 or a LAN
  // address while NEXTAUTH_URL names one of them — never bounce a dev box.
  if (isLoopbackish(host) && isLoopbackish(canonical)) return { kind: "ok" };
  if (params.method === "GET" || params.method === "HEAD") {
    const scheme = canonical.startsWith("localhost") || canonical.startsWith("127.") ? "http" : "https";
    return { kind: "redirect", location: `${scheme}://${canonical}${params.pathAndQuery}` };
  }
  return { kind: "refuse" };
}

function isLoopbackish(host: string): boolean {
  const name = host.replace(/:\d+$/, "");
  return name === "localhost" || name === "127.0.0.1" || name === "0.0.0.0" || name === "[::1]" || /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(name);
}
