import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Prisma's pool defaults to `num_cpus * 2 + 1` connections with a 10 s wait —
 * on a shared Railway host that's whatever the box reports, not what the
 * container gets, and it's the app-side ceiling on concurrency (Postgres
 * allows 500). Pin it explicitly unless the URL already says otherwise.
 */
function withPoolDefaults(url: string | undefined): string | undefined {
  if (!url) return url;
  if (/[?&]connection_limit=/.test(url)) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}connection_limit=20&pool_timeout=20`;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    datasources: { db: { url: withPoolDefaults(process.env.DATABASE_URL) } },
    // Generous limits so multi-step writes survive slow connections instead
    // of timing out mid-request (default is 5s)
    transactionOptions: { maxWait: 10000, timeout: 20000 },
  });

globalForPrisma.prisma = prisma;
