/**
 * Cloudflare Turnstile verification (server side).
 *
 * Env-gated: until TURNSTILE_SECRET_KEY is set, verification passes so the
 * captcha is inert. To activate, create a Turnstile widget at
 * https://dash.cloudflare.com/?to=/:account/turnstile and set:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY  (widget renders when present)
 *   TURNSTILE_SECRET_KEY            (server verification when present)
 */
export async function verifyCaptcha(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // captcha not configured yet

  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Cloudflare unreachable — fail open so a Turnstile outage can't block
    // real signups; the rate limiter still applies.
    return true;
  }
}
