/**
 * Public contact details for the WorkBench marketing site (workbenchfsm.com)
 * and the legacy Streamflaire agency pages that still live in this app.
 * One source of truth so the nav, footer, CTAs, and structured data never
 * drift apart.
 */
export const WB_PHONE = {
  /** How the number reads on the page. */
  display: "(833) 495-0229",
  /** E.164 form for tel: links and schema.org. */
  e164: "+18334950229",
  href: "tel:+18334950229",
} as const;

export const WB_EMAIL = "contact@workbenchfsm.com";
export const WB_EMAIL_HREF = `mailto:${WB_EMAIL}`;

export const APP_STORE_URL = "https://apps.apple.com/app/workbench-fsm/id6789991103";
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.streamflaire.hub";

/**
 * Stock photography for the marketing pages (Unsplash, hot-linked through
 * next/image — images.unsplash.com is in next.config remotePatterns). Each
 * entry is a real photo of trade work, not a render, so the pages read like
 * a business site rather than a product launch.
 */
export const WB_PHOTOS = {
  hero: {
    src: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=1400&q=80&fit=crop",
    alt: "An electrician in a hard hat working on a wall panel",
  },
  trades: {
    src: "https://images.unsplash.com/photo-1574359411659-15573a27fd0c?w=1200&q=80&fit=crop",
    alt: "Two painters on ladders working on the outside of a house",
  },
  paid: {
    src: "https://images.unsplash.com/photo-1632759145351-1d592919f522?w=1200&q=80&fit=crop",
    alt: "A roofer standing on the roof of a brick house with a ladder against the gutter",
  },
} as const;
