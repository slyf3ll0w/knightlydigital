/**
 * The marketing site's demo company, Brightwire Electric — the constants and
 * pure checks. Client-safe: no Prisma, no server imports, so the statically
 * built marketing page can import the links directly. The DB side
 * (create / reset / silence) lives in lib/demo-company.ts and lib/demo-guard.ts.
 *
 * Every value here is FIXED on purpose: lib/demo-company.ts
 * ensureDemoCompany() sets (and repairs) exactly these, so the links on the
 * page never need a database read to be right.
 */

export const DEMO_COMPANY_SLUG = "brightwire-electric";
export const DEMO_COMPANY_NAME = "Brightwire Electric";
/** The demo owner's login. Nobody knows its password; no mail is ever sent to or from it. */
export const DEMO_OWNER_EMAIL = "demo-brightwire-electric@workbenchfsm.com";

/** The fixture client's hub token (Contact.hubToken). 16–128 chars, the hub form's accepted range (lib/hub-form.ts). */
export const DEMO_HUB_TOKEN = "demo-brightwire-maria-hernandez";
/** The fixture booking item's slug (BookingType.slug). */
export const DEMO_BOOKING_ITEM = "free-estimate-visit";
/** Fixed public tokens that mark the fixture quote / invoice (never reused by real documents). */
export const DEMO_QUOTE_TOKEN = "demo-brightwire-electric-quote-panel-upgrade";
export const DEMO_INVOICE_TOKEN = "demo-brightwire-electric-invoice-ceiling-fans";

export const DEMO_BOOKING_PATH = `/embed/${DEMO_COMPANY_SLUG}/${DEMO_BOOKING_ITEM}`;
export const DEMO_HUB_PATH = `/hub/${DEMO_HUB_TOKEN}`;

/** True when `DEMO_COMPANY` is not "0" (the default is on). */
export function demoCompanyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_COMPANY !== "0";
}

export type DemoCompanyCandidate = {
  id: string;
  slug: string;
  isTest: boolean;
  isPlatform?: boolean | null;
  email?: string | null;
};

/**
 * Why this company must NOT be reset (or treated as the demo), or null when
 * it is the demo. The reset deletes records, so it refuses anything that is
 * not unmistakably Brightwire: the slug, the test flag, never the platform
 * company, and the demo owner's inbox as the business email.
 */
export function demoResetRefusal(company: DemoCompanyCandidate | null | undefined): string | null {
  if (!company) return "no company";
  if (company.slug !== DEMO_COMPANY_SLUG) return `slug is "${company.slug}", not "${DEMO_COMPANY_SLUG}"`;
  if (company.isTest !== true) return "company is not a test account";
  if (company.isPlatform) return "company is the platform company";
  if ((company.email ?? "").trim().toLowerCase() !== DEMO_OWNER_EMAIL) return "business email is not the demo owner's";
  return null;
}

export function isDemoCompanyRecord(company: DemoCompanyCandidate | null | undefined): boolean {
  return demoResetRefusal(company) === null;
}

/** An address belonging to the demo company (its owner/business inbox). */
export function isDemoAddress(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === DEMO_OWNER_EMAIL;
}

/**
 * The fixture records a reset keeps, given every id found in the company.
 * Pure so the "never delete the fixtures" rule is unit-tested: returns the
 * ids to delete.
 */
export function idsToDelete(all: string[], keep: Array<string | null | undefined>): string[] {
  const k = new Set(keep.filter((v): v is string => Boolean(v)));
  return all.filter((id) => !k.has(id));
}
