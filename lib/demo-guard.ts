import { prisma } from "@/lib/db";
import { DEMO_COMPANY_SLUG, isDemoCompanyRecord } from "@/lib/demo-company-shared";

/**
 * "Is this the marketing site's demo company?" — the one check every
 * outbound sender (email, texts, team push, client push, webhooks) asks so
 * Brightwire Electric never reaches the outside world. Kept apart from
 * lib/demo-company.ts so lib/email.ts / lib/sms.ts / lib/push.ts can import
 * it without pulling in the fixture code (and without an import cycle: this
 * file imports only the Prisma client and the pure constants).
 *
 * Cache: the demo id, once found, is remembered for the life of the process
 * (a company's id never changes). "Not found" is remembered for 30 s only,
 * so a process that started before the demo company existed picks it up
 * quickly (ensureDemoCompany also primes the cache in its own process).
 */

let demoId: string | null = null;
let missUntil = 0;
const MISS_TTL_MS = 30_000;

/** Prime the cache (ensureDemoCompany calls this). */
export function rememberDemoCompanyId(id: string): void {
  demoId = id;
  missUntil = 0;
}

/** The demo company's id, or null when it does not exist (yet). Never throws. */
export async function demoCompanyId(): Promise<string | null> {
  if (demoId) return demoId;
  if (Date.now() < missUntil) return null;
  try {
    const c = await prisma.company.findUnique({
      where: { slug: DEMO_COMPANY_SLUG },
      select: { id: true, slug: true, isTest: true, isPlatform: true, email: true },
    });
    if (c && isDemoCompanyRecord(c)) {
      demoId = c.id;
      return demoId;
    }
  } catch {
    // A failed lookup is not cached — the next call tries again.
    return null;
  }
  missUntil = Date.now() + MISS_TTL_MS;
  return null;
}

/** True when `companyId` is the demo company. Never throws; null/undefined = false. */
export async function isDemoCompanyId(companyId: string | null | undefined): Promise<boolean> {
  if (!companyId) return false;
  if (demoId) return demoId === companyId;
  const id = await demoCompanyId();
  return id !== null && id === companyId;
}

/** True when the contact belongs to the demo company (for senders keyed by contact). */
export async function isDemoContactId(contactId: string | null | undefined): Promise<boolean> {
  if (!contactId) return false;
  const id = await demoCompanyId();
  if (!id) return false;
  try {
    const c = await prisma.contact.findUnique({ where: { id: contactId }, select: { companyId: true } });
    return c?.companyId === id;
  } catch {
    return false;
  }
}
