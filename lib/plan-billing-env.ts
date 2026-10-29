import { prisma } from "@/lib/db";
import { squareApplicationId } from "@/lib/square";
import { SquareNotConnectedError, squareTokenForCompany } from "@/lib/square-connection";

/**
 * Where plan billing's Square credentials come from (lib/plan-billing.ts,
 * lib/plan-catalog.ts). Split out so the catalog reader and the billing
 * module can import it without importing each other.
 *
 * Two sources, first one wins:
 *  1. env — SQUARE_BILLING_ACCESS_TOKEN (a Developer Console access token
 *     for WorkBench's own account) + SQUARE_BILLING_LOCATION_ID.
 *  2. the WorkBench company's own Square connection (2026-10-29, David:
 *     "run the billing through WorkBench's WorkBench account") — the company
 *     flagged `Company.isPlatform` (superadmin "mark-platform") connects
 *     Square with the ordinary Connect Square button, its grant carries
 *     PLATFORM_BILLING_SCOPES on top of the seller scopes, and plan billing
 *     borrows that token (refreshed by the same sweep as every seller's) and
 *     bills under its location. Nothing to paste anywhere.
 *
 * `planBillingConfigured()` is false when neither is set up — Settings →
 * Plans then says checkout isn't switched on yet.
 */

export type PlanBillingCredentials = {
  token: string;
  locationId: string;
  source: "env" | "connection";
  /** The platform company whose connection is in use (null for env). */
  companyId: string | null;
};

const PLATFORM_LOOKUP_MS = 60_000;
let platformCache: { at: number; company: PlatformCompany | null } | null = null;

type PlatformCompany = { id: string; squareLocationId: string | null; squareMerchantId: string | null };

/** The company flagged as WorkBench's own (cached a minute per instance). */
export async function platformCompany(force = false): Promise<PlatformCompany | null> {
  if (!force && platformCache && Date.now() - platformCache.at < PLATFORM_LOOKUP_MS) return platformCache.company;
  const company = await prisma.company.findFirst({
    where: { isPlatform: true },
    select: { id: true, squareLocationId: true, squareMerchantId: true },
  });
  platformCache = { at: Date.now(), company };
  return company;
}

/** Forget the cached platform company (after mark-platform / a reconnect). */
export function resetPlatformCompanyCache(): void {
  platformCache = null;
}

export async function planBillingCredentials(): Promise<PlanBillingCredentials | null> {
  if (!squareApplicationId()) return null;
  const token = (process.env.SQUARE_BILLING_ACCESS_TOKEN ?? "").trim();
  const locationId = (process.env.SQUARE_BILLING_LOCATION_ID ?? "").trim();
  if (token && locationId) return { token, locationId, source: "env", companyId: null };
  const company = await platformCompany();
  if (!company?.squareLocationId) return null;
  try {
    const got = await squareTokenForCompany(company.id);
    return { token: got.token, locationId: company.squareLocationId, source: "connection", companyId: company.id };
  } catch (err) {
    if (err instanceof SquareNotConnectedError) return null;
    throw err;
  }
}

export async function planBillingConfigured(): Promise<boolean> {
  return (await planBillingCredentials()) !== null;
}

/** Is this Square merchant the platform's own account? (the seller webhook routes its subscription events to plan billing) */
export async function isPlatformMerchant(merchantId: string): Promise<boolean> {
  const company = await platformCompany();
  return Boolean(company && company.squareMerchantId === merchantId);
}
