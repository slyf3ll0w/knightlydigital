import { createHmac, timingSafeEqual } from "crypto";

/**
 * The premium add-on, sold through Livery (paywithlivery.com) exactly the way
 * an outside developer would integrate — hosted checkout link + signed
 * webhooks, documented at paywithlivery.com/developers. No Livery internals
 * are touched from this side.
 *
 * The loop: the upsell page (/app/settings/addon) sends the owner to the
 * checkout link with ?ref=<companyId>; Livery's `subscription.created`
 * webhook (POST /api/public/webhooks/livery) carries that reference back and
 * stamps Company.addonActiveAt; `subscription.canceled` and a final
 * `payment.failed` clear it. Two switches, two jobs:
 *
 *   - Company.addonEnabled  — superadmin VISIBILITY switch (can they see it?)
 *   - Company.addonActiveAt — ENTITLEMENT (did they pay?) — gate features on
 *     hasAddon(), never on addonEnabled.
 *
 * Env (both required for the feature to exist at all):
 *   LIVERY_ADDON_CHECKOUT_URL — the subscription checkout link, e.g.
 *                               https://paywithlivery.com/l/workbench-plus
 *   LIVERY_WEBHOOK_SECRET     — the endpoint's whsec_… signing secret from
 *                               Livery → Settings → Developers
 */

export const ADDON_NAME = "Workbench Plus";

export function addonConfigured(): boolean {
  return Boolean(process.env.LIVERY_ADDON_CHECKOUT_URL && process.env.LIVERY_WEBHOOK_SECRET);
}

/** The one entitlement test — every premium feature gates on this. */
export function hasAddon(company: { addonActiveAt: Date | null }): boolean {
  return Boolean(company.addonActiveAt);
}

/**
 * The hosted checkout URL for one company: ?ref= is the passthrough id Livery
 * echoes back as `reference` in every webhook — it's how the subscription.
 * created event finds its way to the right Company row. email/name prefill
 * the payer form.
 */
export function addonCheckoutUrl(params: {
  companyId: string;
  email?: string | null;
  name?: string | null;
}): string | null {
  const base = process.env.LIVERY_ADDON_CHECKOUT_URL;
  if (!base) return null;
  try {
    const u = new URL(base);
    u.searchParams.set("ref", params.companyId);
    if (params.email) u.searchParams.set("email", params.email);
    if (params.name) u.searchParams.set("name", params.name);
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Verify a Livery-Signature header (`t=<unix seconds>,v1=<hex hmac>`) against
 * the RAW request body: HMAC-SHA256 of `${t}.${rawBody}` with the endpoint
 * secret, constant-time compare, and a staleness window so captured
 * deliveries can't be replayed later. Per paywithlivery.com/developers.
 */
export function verifyLiverySignature(header: string | null, rawBody: string): boolean {
  const secret = process.env.LIVERY_WEBHOOK_SECRET;
  if (!secret || !header) return false;
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const eq = piece.indexOf("=");
    if (eq > 0) parts[piece.slice(0, eq).trim()] = piece.slice(eq + 1).trim();
  }
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1 ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
