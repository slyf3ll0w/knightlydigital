import { Prisma } from "@prisma/client";

/**
 * Request numbers are derived findFirst-then-create against the
 * @@unique([companyId, requestNumber]) constraint, so concurrent submissions
 * can collide with P2002. Wrap the whole derive-and-create (including its
 * transaction, if any — Postgres aborts an interactive transaction on a
 * constraint violation, so the retry must restart it) so the next number is
 * re-derived and the lead isn't dropped with a 500.
 */
export async function withRequestNumberRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        lastError = e;
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
