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

/**
 * One photo per trade for the home page's "Built for the trades" cards, and
 * the three stops of "A day on the job". Same rules as WB_PHOTOS: free
 * Unsplash photos of real work, hot-linked through next/image.
 */
export const WB_TRADE_PHOTOS = {
  plumbing: { src: "https://images.unsplash.com/photo-1676210134188-4c05dd172f89?w=900&q=75&fit=crop", alt: "A plumber fitting the drain pipe under a sink" },
  hvac: { src: "https://images.unsplash.com/photo-1776860150305-108ed577d7d4?w=900&q=75&fit=crop", alt: "An outdoor heat pump unit beside a brick house" },
  electrical: { src: "https://images.unsplash.com/photo-1660330589693-99889d60181e?w=900&q=75&fit=crop", alt: "An electrician in a hi-vis shirt working on an electrical panel" },
  lawn: { src: "https://images.unsplash.com/photo-1731082686849-d2e0a4d2c70c?w=900&q=75&fit=crop", alt: "A man mowing a lawn under fruit trees" },
  roofing: { src: "https://images.unsplash.com/photo-1635424824849-1b09bdcc55b1?w=900&q=75&fit=crop", alt: "A roofer working on a shingled roof with a harness line" },
  cleaning: { src: "https://images.unsplash.com/photo-1646980241033-cd7abda2ee88?w=900&q=75&fit=crop", alt: "A house cleaner carrying a caddy and broom up the stairs" },
  pressure: { src: "https://images.unsplash.com/photo-1707897283727-31befe824066?w=900&q=75&fit=crop", alt: "A man pressure washing a driveway" },
  pool: { src: "https://images.unsplash.com/photo-1774109556498-652c0458d4af?w=900&q=75&fit=crop", alt: "A pool tech cleaning a swimming pool with a long pole" },
} as const;

export const WB_DAY_PHOTOS = {
  morning: { src: "https://images.unsplash.com/photo-1558803116-b443d28fa878?w=900&q=75&fit=crop", alt: "A work van with its back doors open, loaded with tools and parts" },
  arrive: { src: "https://images.unsplash.com/photo-1731341711541-e0cb3d60bdaf?w=900&q=75&fit=crop", alt: "A tradesman walking up to a customer's front porch" },
  paid: { src: "https://images.unsplash.com/photo-1621905253185-95614217f357?w=900&q=75&fit=crop", alt: "A tradesman in a hard hat checking his phone" },
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
