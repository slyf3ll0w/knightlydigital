/**
 * Browser-side half of the marketing site's first-party conversion tracking
 * (the server half is lib/site-events.ts + /api/site/event). No vendor,
 * no cookie banner: a random visitor id in localStorage, the UTM tags and
 * referrer the visitor arrived with in sessionStorage, and a beacon for
 * the few events that matter (a Get started click, a free-tool download,
 * a sign-up). Page views are Cloudflare Web Analytics' job.
 *
 * Safe to import from client components only (touches window).
 */

export type SiteAttribution = {
  referrer?: string;
  landing?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

export type SiteEventName = "cta_click" | "signup" | "apply_submit" | "tool_pdf" | "tool_draft" | "tool_open";

const ATTR_KEY = "wb_attr";
const VISITOR_KEY = "wb_vid";

function safeGet(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: Storage, key: string, value: string) {
  try {
    storage.setItem(key, value);
  } catch {
    /* private mode / blocked storage: tracking is best effort */
  }
}

/** A random id per browser (not a cookie, never sent to a third party). */
export function visitorId(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const existing = safeGet(window.localStorage, VISITOR_KEY);
  if (existing) return existing;
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  safeSet(window.localStorage, VISITOR_KEY, id);
  return id;
}

/**
 * Remember how this session arrived. Called once per page load: the first
 * page with UTM tags (or an outside referrer) wins for the rest of the
 * session, so a sign-up three pages later still carries the campaign.
 */
export function captureAttribution(): SiteAttribution {
  if (typeof window === "undefined") return {};
  const saved = safeGet(window.sessionStorage, ATTR_KEY);
  const params = new URLSearchParams(window.location.search);
  const fromUrl: SiteAttribution = {};
  const pairs: [keyof SiteAttribution, string][] = [
    ["utmSource", "utm_source"],
    ["utmMedium", "utm_medium"],
    ["utmCampaign", "utm_campaign"],
    ["utmContent", "utm_content"],
    ["utmTerm", "utm_term"],
  ];
  for (const [key, param] of pairs) {
    const v = params.get(param)?.trim();
    if (v) fromUrl[key] = v.slice(0, 120);
  }
  const hasUtm = Object.keys(fromUrl).length > 0;
  if (saved && !hasUtm) {
    try {
      return JSON.parse(saved) as SiteAttribution;
    } catch {
      /* fall through and rewrite */
    }
  }
  let referrer: string | undefined;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.host !== window.location.host) referrer = ref.origin + ref.pathname;
  } catch {
    referrer = undefined;
  }
  const attr: SiteAttribution = {
    ...fromUrl,
    ...(referrer ? { referrer: referrer.slice(0, 200) } : {}),
    landing: (window.location.pathname || "/").slice(0, 200),
  };
  // Only overwrite a saved attribution when the new page carries UTM tags;
  // an internal navigation never resets the campaign.
  if (!saved || hasUtm) safeSet(window.sessionStorage, ATTR_KEY, JSON.stringify(attr));
  return attr;
}

export function getAttribution(): SiteAttribution {
  if (typeof window === "undefined") return {};
  const saved = safeGet(window.sessionStorage, ATTR_KEY);
  if (!saved) return captureAttribution();
  try {
    return JSON.parse(saved) as SiteAttribution;
  } catch {
    return {};
  }
}

/** Fire-and-forget. Uses sendBeacon so a click that leaves the page still lands. */
export function trackSiteEvent(name: SiteEventName, label?: string) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify({
    name,
    label: label?.slice(0, 120),
    path: (window.location.pathname || "/").slice(0, 200),
    visitorId: visitorId(),
    ...getAttribution(),
  });
  try {
    if (navigator.sendBeacon) {
      const ok = navigator.sendBeacon("/api/site/event", new Blob([body], { type: "text/plain" }));
      if (ok) return;
    }
    void fetch("/api/site/event", { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
  } catch {
    /* best effort */
  }
}

/** Which CTA a link is, for the automatic click listener. */
export function ctaLabelFor(href: string): string | null {
  if (href.startsWith("/apply")) return "get_started";
  if (href.startsWith("/app/login")) return "log_in";
  if (href.startsWith("tel:")) return "call";
  if (href.startsWith("/tools/")) return "tool_open";
  return null;
}
