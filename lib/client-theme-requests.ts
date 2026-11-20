import type { PublishTarget } from "@/lib/client-theme-store";

/**
 * Pure request rules for the Settings → Client pages routes
 * (app/api/app/client-theme/*), unit-tested in
 * scripts/test-client-theme-requests.ts. No Prisma.
 */

/**
 * What a publish body asks for: { draft: true }, { version: n } (a whole
 * number ≥ 1), or { reset: true } / { version: "default" }. Anything else,
 * or two asks at once, is null (400).
 */
export function publishTargetOf(body: unknown): PublishTarget | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const asks = [b.draft === true, b.reset === true || b.version === "default", typeof b.version === "number"].filter(Boolean).length;
  if (asks !== 1) return null;
  if (b.draft === true) return typeof b.expect === "string" && /^[0-9a-f]{16}$/.test(b.expect) ? { draft: true, expect: b.expect } : { draft: true };
  if (b.reset === true || b.version === "default") return { reset: true };
  const v = b.version as number;
  return Number.isInteger(v) && v > 0 && v < 1_000_000 ? { version: v } : null;
}

/** Where a draft is looked at: fixture portal + sign-in, the real booking page and one form in owner preview. */
export function themePreviewLinks(token: string | null | undefined, slug: string, formSlug: string | null) {
  if (!token) return null;
  const t = encodeURIComponent(token);
  return {
    portal: `/client-preview?theme=${t}&doc=hub`,
    login: `/client-preview?theme=${t}&doc=login`,
    booking: `/book/${encodeURIComponent(slug)}?preview=1&theme=${t}`,
    form: formSlug ? `/book/${encodeURIComponent(slug)}/${encodeURIComponent(formSlug)}?preview=1&theme=${t}` : `/client-preview?theme=${t}&doc=form`,
  };
}

/** A ?theme= value that is a draft token, not the booking page's old light/dark override or a fixture name. */
export function isDraftToken(value: string | null | undefined): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 200 && /^[A-Za-z0-9_-]+$/.test(value);
}
