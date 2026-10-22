// Playwright global setup: verify the target deployment, mint NextAuth session
// cookies for both E2E company owners (Turnstile blocks scripted logins — the
// cookie IS the auth), decide whether card specs may run, and hand everything
// to the specs via e2e/.state.json.
import { writeFileSync } from "node:fs";
import { encode } from "next-auth/jwt";
import { createSuperadminSessionToken } from "../lib/superadmin-session";
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
  // What the DEPLOYED app charges through (/api/health `processor`). The
  // workflow's own PAYMENT_PROCESSOR says what the specs can drive; the two
  // must agree or the Finix card specs would look for a form that isn't there
  // (staging on Square, 2026-10-16). Older deploys don't report it = assume
  // the env is right.
  const deployedProcessor: string | null = await fetch(`${baseUrl}/api/health`)
    .then((r) => r.json() as Promise<{ processor?: string }>)
    .then((h) => h.processor ?? null)
    .catch(() => null);

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

    // The platform console signs in with its own cookie (no NextAuth, no
    // emailed code): mint one for the first active superadmin, if any.
    const saUser = await prisma.user.findFirst({
      where: { role: "SUPERADMIN", isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    const superadmin = saUser ? { token: await createSuperadminSessionToken(saUser.id), userId: saUser.id } : null;

    // Hard safety gate for the specs that move (sandbox) money: the DEPLOYED
    // processor must be finix AND the local env must say sandbox AND company A
    // must hold an APPROVED merchant. FINIX_ENVIRONMENT=live disables them —
    // the suite must never charge real cards.
    const finixSandbox =
      (process.env.PAYMENT_PROCESSOR ?? "") === "finix" &&
      (deployedProcessor === null || deployedProcessor === "finix") &&
      (process.env.FINIX_ENVIRONMENT ?? "") === "sandbox" &&
      Boolean(process.env.FINIX_API_USERNAME && process.env.FINIX_API_PASSWORD);
    if (deployedProcessor && deployedProcessor !== "finix") {
      console.log(`[e2e] deployed processor is "${deployedProcessor}" — Finix card specs will skip`);
    }
    const cardTestsEnabled =
      finixSandbox &&
      Boolean(a.company.finixMerchantId) &&
      a.company.finixOnboardingState === "APPROVED";

    // Same gate for Square: deployed processor square, SQUARE_ENVIRONMENT
    // sandbox, the test seller's token present (provision.mts seeded the
    // connection with it) and company A actually connected.
    const squareSandbox =
      (process.env.PAYMENT_PROCESSOR ?? "") === "square" &&
      (deployedProcessor === null || deployedProcessor === "square") &&
      (process.env.SQUARE_ENVIRONMENT ?? "") === "sandbox" &&
      Boolean(process.env.SQUARE_E2E_ACCESS_TOKEN);
    if (deployedProcessor && deployedProcessor !== "square") {
      console.log(`[e2e] deployed processor is "${deployedProcessor}" — Square card specs will skip`);
    }
    const squareCardTestsEnabled =
      squareSandbox && Boolean(a.company.squareMerchantId) && a.company.squareConnectedAt != null;

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
      squareCardTestsEnabled,
      superadmin,
    };
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
    const cards = cardTestsEnabled
      ? "Finix ENABLED (sandbox)"
      : squareCardTestsEnabled
        ? "Square ENABLED (sandbox)"
        : "skipped";
    console.log(
      `[e2e] target ${baseUrl} · card tests ${cards} · console ${superadmin ? "signed in" : "skipped (no superadmin)"}`
    );
  } finally {
    await prisma.$disconnect();
  }
}
