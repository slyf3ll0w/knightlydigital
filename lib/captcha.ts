/**
 * Cloudflare Turnstile verification (server side).
 *
 * Env-gated: until TURNSTILE_SECRET_KEY is set, verification passes so the
 * captcha is inert. To activate, create a Turnstile widget at
 * https://dash.cloudflare.com/?to=/:account/turnstile and set:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (widget renders when present)
 *   TURNSTILE_SECRET_KEY            (server verification when present)
 *   TURNSTILE_HOSTNAMES             (optional CSV override; defaults to the
 *                                    hostnames this deployment serves)
 *
 * Per Cloudflare's integration guidance a token is accepted only when three
 * things line up: success, the action matching the form that minted it (so a
 * token farmed on one page can't be spent on another), and a hostname this
 * deployment actually serves. Replay is Cloudflare's job — tokens are
 * single-use and the second redemption fails there.
 */

/** Hostnames this deployment answers on: the custom domain (apex AND www —
 *  public booking/apply forms are reachable on either), the Railway domain,
 *  and localhost for development. */
function allowedHostnames(): Set<string> {
  const explicit = (process.env.TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (explicit.length) return new Set(explicit);

  const hosts = ["localhost", "127.0.0.1"];
  const appUrl = process.env.NEXTAUTH_URL;
  if (appUrl) {
    try {
      const host = new URL(appUrl).hostname.toLowerCase();
      hosts.push(host);
      hosts.push(host.startsWith("www.") ? host.slice(4) : `www.${host}`);
    } catch {
      // Malformed NEXTAUTH_URL — the Railway domain below still covers prod.
    }
  }
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railway) hosts.push(railway.toLowerCase());
  return new Set(hosts);
}

/** Must match the `action` the widget was rendered with. */
export type CaptchaAction = "signup" | "login";

export async function verifyCaptcha(
  token: string | null | undefined,
  action?: CaptchaAction
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // captcha not configured yet

  if (typeof token !== "string" || !token || token.length > 2048) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret, response: token }),
    });
    if (!res.ok) {
      console.error("[captcha] siteverify HTTP %d", res.status);
      return false;
    }
    const data = (await res.json()) as {
      success?: boolean;
      action?: string;
      hostname?: string;
      "error-codes"?: string[];
    };
    if (data.success !== true) {
      // Cloudflare's error-codes are the only way to tell a bad secret
      // (invalid-input-secret) from a replayed token (timeout-or-duplicate).
      console.error("[captcha] rejected: %j", data["error-codes"] ?? []);
      return false;
    }
    if (action && data.action !== action) {
      console.error("[captcha] action mismatch: got %j want %j", data.action, action);
      return false;
    }
    const allowed = allowedHostnames();
    if (!data.hostname || !allowed.has(String(data.hostname).toLowerCase())) {
      console.error(
        "[captcha] hostname %j not in allowlist %j — set TURNSTILE_HOSTNAMES",
        data.hostname,
        [...allowed]
      );
      return false;
    }
    return true;
  } catch {
    // Cloudflare unreachable — with a secret configured, fail closed.
    return false;
  }
}
