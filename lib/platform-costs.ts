/**
 * Platform unit economics — what each metered unit costs US, priced against
 * the CompanyUsageDaily counters and Payment rows for the /superadmin
 * profitability dashboard.
 *
 * Every rate is env-tunable so finalized vendor pricing is a Railway variable
 * change, not a deploy. The defaults below are honest ballparks from public
 * price lists (marked ~) — the dashboard shows an "estimated pricing" badge
 * until PLATFORM_PRICING_CONFIRMED=1 says David has entered the real numbers.
 *
 * Two cost families:
 *  - Usage costs (AI tokens, email, SMS, storage) — deterministic per unit.
 *  - Card processing buy-rate (interchange + network + Finix margin) — varies
 *    per transaction; estimated here from card brand/type, trued up monthly by
 *    importing Finix's Net Profit report into FinixCostSnapshot.
 */

const num = (env: string | undefined, fallback: number): number => {
  const n = Number(env);
  return Number.isFinite(n) && env !== undefined && env !== "" ? n : fallback;
};

/** True once David has replaced the ballpark defaults with contract pricing. */
export function platformPricingConfirmed(): boolean {
  return process.env.PLATFORM_PRICING_CONFIRMED === "1";
}

// ─── Usage unit prices (cents) ────────────────────────────────────────────────

export function unitPrices() {
  return {
    // Gemini 2.5 Flash paid tier: ~$0.30/M input, ~$2.50/M output, cached
    // input billed at 25% of input price.
    aiInCentsPerMTokens: num(process.env.COST_AI_IN_PER_M_CENTS, 30),
    aiOutCentsPerMTokens: num(process.env.COST_AI_OUT_PER_M_CENTS, 250),
    aiCachedCentsPerMTokens: num(process.env.COST_AI_CACHED_PER_M_CENTS, 7.5),
    // Resend $20/mo ÷ 50k emails ≈ 0.04¢ each.
    emailCents: num(process.env.COST_EMAIL_CENTS, 0.04),
    // Telnyx US SMS ~0.4¢/segment + ~0.3¢ carrier pass-through.
    smsSegmentCents: num(process.env.COST_SMS_SEGMENT_CENTS, 0.7),
    // Railway Postgres ~$0.25/GB-month.
    storageGbMonthCents: num(process.env.COST_STORAGE_GB_MONTH_CENTS, 25),
  };
}

/** Cost in cents of one CompanyUsageDaily row's counters (excludes storage —
 *  storage is a point-in-time snapshot priced per month, not per day). */
export function usageCostCents(row: {
  aiTokensIn: number;
  aiTokensOut: number;
  aiTokensCached: number;
  emailsSent: number;
  smsSegments: number;
}): number {
  const p = unitPrices();
  // Cached tokens are INCLUDED in promptTokenCount — bill the cached share at
  // the cached rate and only the remainder at the full input rate.
  const freshIn = Math.max(0, row.aiTokensIn - row.aiTokensCached);
  return (
    (freshIn * p.aiInCentsPerMTokens) / 1_000_000 +
    (row.aiTokensCached * p.aiCachedCentsPerMTokens) / 1_000_000 +
    (row.aiTokensOut * p.aiOutCentsPerMTokens) / 1_000_000 +
    row.emailsSent * p.emailCents +
    row.smsSegments * p.smsSegmentCents
  );
}

/** Monthly cost in cents of holding `bytes` in Postgres. */
export function storageCostCentsPerMonth(bytes: number): number {
  return (bytes / 1_073_741_824) * unitPrices().storageGbMonthCents;
}

// ─── Card processing buy-rate estimate ───────────────────────────────────────

/**
 * Rough CNP interchange (bps + fixed ¢) by brand × credit/debit. Everything
 * through /pay is card-not-present. Debit rows blend regulated (big-bank,
 * 0.05% + 22¢) and exempt (~1.65% + 15¢) since we can't see the issuer size.
 * Override the whole table with COST_INTERCHANGE_TABLE_JSON, same shape.
 */
const DEFAULT_INTERCHANGE: Record<string, { bps: number; fixedCents: number }> = {
  "VISA:CREDIT": { bps: 190, fixedCents: 10 },
  "VISA:DEBIT": { bps: 90, fixedCents: 19 },
  "MASTERCARD:CREDIT": { bps: 195, fixedCents: 10 },
  "MASTERCARD:DEBIT": { bps: 90, fixedCents: 19 },
  "AMERICAN_EXPRESS:CREDIT": { bps: 230, fixedCents: 10 },
  "DISCOVER:CREDIT": { bps: 195, fixedCents: 10 },
  "DISCOVER:DEBIT": { bps: 110, fixedCents: 16 },
  DEFAULT: { bps: 180, fixedCents: 12 },
};

function interchangeTable(): typeof DEFAULT_INTERCHANGE {
  const raw = process.env.COST_INTERCHANGE_TABLE_JSON;
  if (!raw) return DEFAULT_INTERCHANGE;
  try {
    return { ...DEFAULT_INTERCHANGE, ...JSON.parse(raw) };
  } catch {
    console.error("[platform-costs] COST_INTERCHANGE_TABLE_JSON is not valid JSON — using defaults");
    return DEFAULT_INTERCHANGE;
  }
}

/**
 * Estimated buy-rate cost in cents for one processor payment — what the
 * transaction costs US before Finix's monthly report says for sure.
 * interchange + card-brand assessments + Finix's per-tx margin (ACH: flat).
 * Set FINIX_* env vars from the finalized Finix agreement when it lands.
 */
export function estimateProcessingCostCents(params: {
  amountCents: number;
  method: "CARD" | "ACH";
  cardBrand?: string | null;
  cardType?: string | null;
}): number {
  if (params.method === "ACH") {
    return Math.round(
      (params.amountCents * num(process.env.FINIX_ACH_COST_BPS, 25)) / 10_000 +
        num(process.env.FINIX_ACH_COST_FIXED_CENTS, 25)
    );
  }
  const table = interchangeTable();
  const brand = (params.cardBrand ?? "").toUpperCase();
  const type = (params.cardType ?? "CREDIT").toUpperCase() === "DEBIT" ? "DEBIT" : "CREDIT";
  const ic = table[`${brand}:${type}`] ?? table.DEFAULT;
  const assessmentsBps = num(process.env.COST_CARD_ASSESSMENTS_BPS, 14); // network dues ~0.13–0.14%
  const marginBps = num(process.env.FINIX_CARD_MARGIN_BPS, 50); // Finix's cut — replace with contract number
  const marginFixed = num(process.env.FINIX_CARD_MARGIN_FIXED_CENTS, 25);
  return Math.round(
    (params.amountCents * (ic.bps + assessmentsBps + marginBps)) / 10_000 +
      ic.fixedCents +
      marginFixed
  );
}
