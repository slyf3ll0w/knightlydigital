// Playwright global setup: verify the target deployment, mint NextAuth session
// cookies for both E2E company owners (Turnstile blocks scripted logins — the
// cookie IS the auth), decide whether card specs may run, and hand everything
// to the specs via e2e/.state.json.
import { writeFileSync } from "node:fs";
import { encode } from "next-auth/jwt";
import {
  loadE2eEnv,
  STATE_FILE,
  COMPANY_A_SLUG,
  COMPANY_B_SLUG,
  OWNER_A_EMAIL,
  OWNER_B_EMAIL,
  type E2eState,
} from "./env";

export default async function globalSetup(): Promise<void> {
  loadE2eEnv();
  const baseUrl = process.env.E2E_BASE_URL ?? "https://workbenchfsm.com";
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET missing — fill e2e/.env.e2e (see e2e/README.md).");
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL missing — fill e2e/.env.e2e (see e2e/README.md).");
  }

  // The deployment must be reachable before we burn test budget.
  const ping = await fetch(`${baseUrl}/app/login`, { redirect: "manual" });
  if (ping.status >= 500) throw new Error(`${baseUrl} answered ${ping.status} — aborting.`);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const mint = async (slug: string, email: string) => {
      const company = await prisma.company.findUnique({ where: { slug } });
      if (!company) {
        throw new Error(`Company "${slug}" not found — run: npx tsx e2e/provision.mts`);
      }
      const user = await prisma.user.findFirst({
        where: { email, companyId: company.id, isActive: true },
      });
      if (!user) throw new Error(`Owner ${email} not found — run: npx tsx e2e/provision.mts`);
      const token = await encode({
        token: {
          name: user.name,
          email: user.email,
          sub: user.id,
          id: user.id,
          role: user.role,
          companyId: user.companyId,
        },
        secret,
        maxAge: 60 * 60 * 4,
      });
      return { token, userId: user.id, companyId: company.id, company };
    };

    const a = await mint(COMPANY_A_SLUG, OWNER_A_EMAIL);
    const b = await mint(COMPANY_B_SLUG, OWNER_B_EMAIL);

    // Hard safety gate for the specs that move (sandbox) money: the DEPLOYED
    // processor must be finix AND the local env must say sandbox AND company A
    // must hold an APPROVED merchant. FINIX_ENVIRONMENT=live disables them —
    // the suite must never charge real cards.
    const finixSandbox =
      (process.env.PAYMENT_PROCESSOR ?? "") === "finix" &&
      (process.env.FINIX_ENVIRONMENT ?? "") === "sandbox" &&
      Boolean(process.env.FINIX_API_USERNAME && process.env.FINIX_API_PASSWORD);
    const cardTestsEnabled =
      finixSandbox &&
      Boolean(a.company.finixMerchantId) &&
      a.company.finixOnboardingState === "APPROVED";

    const state: E2eState = {
      baseUrl,
      cookieName: baseUrl.startsWith("https")
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      ownerA: { token: a.token, userId: a.userId, companyId: a.companyId },
      ownerB: { token: b.token, userId: b.userId, companyId: b.companyId },
      companyASlug: COMPANY_A_SLUG,
      cardTestsEnabled,
      finix: cardTestsEnabled
        ? {
            applicationId: process.env.FINIX_APPLICATION_ID ?? "",
            username: process.env.FINIX_API_USERNAME!,
            password: process.env.FINIX_API_PASSWORD!,
          }
        : null,
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    console.log(
      `[e2e] target ${baseUrl} · card tests ${cardTestsEnabled ? "ENABLED (sandbox)" : "skipped"}`
    );
  } finally {
    await prisma.$disconnect();
  }
}
