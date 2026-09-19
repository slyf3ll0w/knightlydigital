import type { EstimatorInput, EstimatorResultLine, EstimatorSpec } from "./estimator";

/**
 * Website forms for estimate tools (docs/plans/ai-estimators-2026-09-19.md,
 * Batch 3). A saved tool can be published at
 * /book/[companySlug]/estimate/[publicSlug] (and inside an iframe via
 * /embed/…): the visitor answers the tool's questions, sees an estimate
 * (exact, a range, or nothing — the owner's call), leaves their details, and
 * the business gets a lead + request (+ a draft or sent quote).
 *
 * Client-safe: no Prisma, no I/O. `sanitizePublicConfig` is the one gate
 * for what gets stored (Atlas card, settings sheet and API all go through
 * it); the public pages never see the spec's formulas, only `publicInputs`.
 */

export type PublicField = { show: boolean; required: boolean };

export type EstimatorPublicConfig = {
  /** Form heading; "" = the tool's name */
  heading: string;
  /** Text under the heading; "" = the spec's intro */
  intro: string;
  /** "" = "See my estimate" (instant) / "Get my quote" (after_contact) */
  buttonLabel: string;
  /** What the visitor sees: the exact lines + total, a ± range, or no number */
  showPrice: "exact" | "range" | "hidden";
  /** Half-width of the range as a percent of the subtotal (range mode) */
  rangePct: number;
  /** instant = estimate first, then "want this quote?"; after_contact = details first, estimate on the thank-you screen */
  reveal: "instant" | "after_contact";
  /** draft = lead + request + draft quote; send = the quote goes to the client for approval; request = lead + request only */
  onSubmit: "draft" | "send" | "request";
  fields: {
    email: PublicField;
    phone: PublicField;
    address: PublicField;
    message: PublicField & { label: string };
  };
  /** Always shown under the estimate */
  disclaimer: string;
  /** Thank-you text; "" = a default that fits onSubmit */
  successMessage: string;
};

export const PUBLIC_LIMITS = {
  slug: 50,
  heading: 100,
  intro: 300,
  buttonLabel: 40,
  disclaimer: 300,
  successMessage: 300,
  messageLabel: 60,
  rangePctMin: 5,
  rangePctMax: 50,
} as const;

export const DEFAULT_DISCLAIMER = "This is an estimate based on your answers, not a final price. We'll confirm the details with you before any work begins.";

export function defaultPublicConfig(): EstimatorPublicConfig {
  return {
    heading: "",
    intro: "",
    buttonLabel: "",
    showPrice: "exact",
    rangePct: 15,
    reveal: "instant",
    onSubmit: "draft",
    fields: {
      email: { show: true, required: true },
      phone: { show: true, required: false },
      address: { show: false, required: false },
      message: { show: true, required: false, label: "Anything else we should know?" },
    },
    disclaimer: DEFAULT_DISCLAIMER,
    successMessage: "",
  };
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function field(raw: unknown, fallback: PublicField): PublicField {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const show = r.show === undefined ? fallback.show : r.show === true || r.show === "true";
  const required = show && (r.required === undefined ? fallback.required : r.required === true || r.required === "true");
  return { show, required };
}

/**
 * Normalize untrusted input (PATCH body, Atlas args, stored JSON) into a
 * well-formed config. Missing pieces fall back to defaults; a null column
 * reads as "defaults". Guarantees the form can always reach the visitor
 * (email or phone shown) and that at least one contact detail is required.
 */
export function sanitizePublicConfig(raw: unknown): EstimatorPublicConfig {
  const d = defaultPublicConfig();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Record<string, unknown>;
  const rawFields = (r.fields && typeof r.fields === "object" ? r.fields : {}) as Record<string, unknown>;
  const fields = {
    email: field(rawFields.email, d.fields.email),
    phone: field(rawFields.phone, d.fields.phone),
    address: field(rawFields.address, d.fields.address),
    message: {
      ...field(rawFields.message, d.fields.message),
      label: str((rawFields.message as Record<string, unknown> | undefined)?.label, PUBLIC_LIMITS.messageLabel) || d.fields.message.label,
    },
  };
  // A submission must be able to reach someone
  if (!fields.email.show && !fields.phone.show) fields.email = { show: true, required: true };
  if (!fields.email.required && !fields.phone.required) {
    if (fields.email.show) fields.email.required = true;
    else fields.phone.required = true;
  }
  const showPrice = r.showPrice === "range" || r.showPrice === "hidden" ? r.showPrice : "exact";
  const onSubmit = r.onSubmit === "send" || r.onSubmit === "request" ? r.onSubmit : "draft";
  // Sending a quote the visitor never saw makes no sense — hidden + send → draft
  const pctRaw = Number(r.rangePct);
  const rangePct = Number.isFinite(pctRaw) ? Math.min(PUBLIC_LIMITS.rangePctMax, Math.max(PUBLIC_LIMITS.rangePctMin, Math.round(pctRaw))) : d.rangePct;
  return {
    heading: str(r.heading, PUBLIC_LIMITS.heading),
    intro: str(r.intro, PUBLIC_LIMITS.intro),
    buttonLabel: str(r.buttonLabel, PUBLIC_LIMITS.buttonLabel),
    showPrice,
    rangePct,
    reveal: r.reveal === "after_contact" ? "after_contact" : "instant",
    onSubmit: showPrice === "hidden" && onSubmit === "send" ? "draft" : onSubmit,
    fields,
    disclaimer: r.disclaimer === "" ? "" : str(r.disclaimer, PUBLIC_LIMITS.disclaimer) || d.disclaimer,
    successMessage: str(r.successMessage, PUBLIC_LIMITS.successMessage),
  };
}

/** URL part for a tool: "Driveway & house wash" → "driveway-house-wash". */
export function publicSlugFrom(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PUBLIC_LIMITS.slug)
    .replace(/-+$/g, "");
}

export const PUBLIC_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Round a dollar figure to a "friendly" step for a range: $10 under $500, $25 under $2k, $50 under $10k, else $100. */
export function friendlyRound(x: number, dir: "down" | "up"): number {
  const step = x < 500 ? 10 : x < 2000 ? 25 : x < 10000 ? 50 : 100;
  const r = dir === "down" ? Math.floor(x / step) * step : Math.ceil(x / step) * step;
  return Math.max(0, r);
}

/** The ± range shown in "range" mode. Low never drops below the job minimum when one exists. */
export function estimateRange(subtotal: number, pct: number, minimumTotal?: number): { low: number; high: number } {
  const half = subtotal * (pct / 100);
  let low = friendlyRound(subtotal - half, "down");
  const high = friendlyRound(subtotal + half, "up");
  if (minimumTotal && low < minimumTotal) low = minimumTotal;
  if (low > subtotal) low = friendlyRound(subtotal, "down");
  return { low, high: Math.max(high, low) };
}

/** What a visitor may see of the spec: inputs and intro only — never the formulas or the price book. */
export type PublicEstimatorInput = EstimatorInput;

export function publicInputs(spec: EstimatorSpec): PublicEstimatorInput[] {
  return spec.inputs.map((i) => ({ ...i }));
}

export type PublicEstimateLine = { name: string; description: string; quantity: number; unitPrice: number; total: number; isOptional: boolean };

/** The estimate as the visitor sees it, shaped by showPrice. */
export type PublicEstimate =
  | { mode: "exact"; lines: PublicEstimateLine[]; subtotal: number; title?: string }
  | { mode: "range"; low: number; high: number; title?: string }
  | { mode: "hidden"; title?: string };

export function shapeEstimate(
  result: { lines: EstimatorResultLine[]; subtotal: number; title?: string },
  config: Pick<EstimatorPublicConfig, "showPrice" | "rangePct">,
  minimumTotal?: number
): PublicEstimate {
  if (config.showPrice === "hidden") return { mode: "hidden", title: result.title };
  if (config.showPrice === "range") {
    const { low, high } = estimateRange(result.subtotal, config.rangePct, minimumTotal);
    return { mode: "range", low, high, title: result.title };
  }
  return {
    mode: "exact",
    lines: result.lines.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      total: Math.round(l.quantity * l.unitPrice * 100) / 100,
      isOptional: l.isOptional,
    })),
    subtotal: result.subtotal,
    title: result.title,
  };
}

export const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const moneyWhole = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** "$850 – $1,150" / "$1,234.00" / "" */
export function estimateLabel(e: PublicEstimate): string {
  if (e.mode === "exact") return money(e.subtotal);
  if (e.mode === "range") return `${moneyWhole(e.low)} – ${moneyWhole(e.high)}`;
  return "";
}

/** Human line for the settings row / Atlas card: "price shown as a range (±15%) · lead + draft quote". */
export function describePublicConfig(c: EstimatorPublicConfig): string[] {
  const price = c.showPrice === "exact" ? "shows the exact estimate" : c.showPrice === "range" ? `shows a range (±${c.rangePct}%)` : "shows no price (you follow up)";
  const when = c.reveal === "instant" ? "before asking for details" : "after they leave their details";
  const result = c.onSubmit === "send" ? "each submission creates a lead + request and emails the quote for approval" : c.onSubmit === "draft" ? "each submission creates a lead + request + draft quote" : "each submission creates a lead + request";
  const asks = [
    "name",
    c.fields.email.show ? `email${c.fields.email.required ? "" : " (optional)"}` : null,
    c.fields.phone.show ? `phone${c.fields.phone.required ? "" : " (optional)"}` : null,
    c.fields.address.show ? `address${c.fields.address.required ? "" : " (optional)"}` : null,
  ].filter(Boolean);
  return [`Form ${price}${c.showPrice === "hidden" ? "" : ` ${when}`}`, `Asks for: ${asks.join(", ")}`, result[0].toUpperCase() + result.slice(1)];
}

/** Default thank-you copy per onSubmit. */
export function defaultSuccessMessage(c: EstimatorPublicConfig, businessName: string): string {
  if (c.successMessage) return c.successMessage;
  if (c.onSubmit === "send") return `Your quote is on its way — check your email. ${businessName} will be in touch if anything needs a closer look.`;
  return `Thanks! ${businessName} will review your answers and get back to you within 1 business day.`;
}

export function defaultButtonLabel(c: EstimatorPublicConfig): string {
  if (c.buttonLabel) return c.buttonLabel;
  return c.reveal === "instant" && c.showPrice !== "hidden" ? "See my estimate" : "Get my quote";
}
