import { Prisma } from "@prisma/client";

/**
 * Per-company document numbers (request #, job #, quote #, invoice #) are
 * derived findFirst-then-create against a `@@unique([companyId, …Number])`
 * constraint, so two concurrent creates in the same company can collide with
 * P2002 — routine in a busy shop (office manager and tech invoicing at once,
 * or the nightly subscription cron overlapping a manual create). Unwrapped
 * that surfaces as a bare 500 and the user loses everything they typed.
 *
 * Wrap the whole derive-and-create — INCLUDING its transaction, since Postgres
 * aborts an interactive transaction on a constraint violation, so the retry
 * has to restart it — and the next number is simply re-derived.
 *
 * Only number collisions retry. Any other unique violation (an already-invoiced
 * job, a duplicate email) is a real conflict that retrying can't fix, so it's
 * rethrown for the caller to turn into a proper message.
 */

const NUMBER_FIELDS = ["requestNumber", "jobNumber", "quoteNumber", "invoiceNumber"];

function isDocNumberClash(e: unknown): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return false;
  // `meta.target` is a field-name array on most versions and the raw
  // constraint name ("Invoice_companyId_invoiceNumber_key") on others.
  const target = e.meta?.target;
  const haystack = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return NUMBER_FIELDS.some((field) => haystack.includes(field));
}

export async function withDocNumberRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isDocNumberClash(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}
