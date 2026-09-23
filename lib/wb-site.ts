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

export const WB_EMAIL = "info@streamflaire.com";
export const WB_EMAIL_HREF = `mailto:${WB_EMAIL}`;
