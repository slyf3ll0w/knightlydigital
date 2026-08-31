// One-time (idempotent) provisioning of the two E2E companies the suite runs
// against. Safe to re-run — it upserts. Run with the same env the suite uses:
//
//   npx tsx e2e/provision.mts
//
// Needs DATABASE_URL (Railway public URL) in e2e/.env.e2e or the environment;
// FINIX_* sandbox vars enable the real-charge merchant for company A.
//
//  - Company A ("E2E Harness Co", slug e2e-harness): paymentsWaived, and when
//    Finix sandbox creds are present, a provisioned + APPROVED sandbox
//    merchant so card-charge specs exercise the REAL /pay flow (fake money).
//    surcharging ON at 3% so surcharge math is under test.
//  - Company B ("E2E Tenant B", slug e2e-tenant-b): minimal, paymentsWaived —
//    exists purely to prove cross-tenant isolation.
//
// Owners get a random password hash — nobody logs in with a password; the
// suite mints NextAuth session cookies directly (Turnstile blocks scripted
// logins by design).
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { loadE2eEnv, COMPANY_A_SLUG, COMPANY_B_SLUG, OWNER_A_EMAIL, OWNER_B_EMAIL } from "./env";

loadE2eEnv();
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set — fill e2e/.env.e2e first (see e2e/README.md).");
  process.exit(1);
}

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();

async function upsertCompany(slug: string, name: string, extras: Record<string, unknown> = {}) {
  const existing = await prisma.company.findUnique({ where: { slug } });
  const data = {
    name,
    email: null,
    timezone: "America/Chicago",
    paymentsWaived: true,
    ...extras,
  };
  const company = existing
    ? await prisma.company.update({ where: { id: existing.id }, data })
    : await prisma.company.create({ data: { slug, ...data } });
  return company;
}

async function upsertOwner(companyId: string, email: string, name: string) {
  const existing = await prisma.user.findFirst({ where: { email, companyId } });
  if (existing) {
    if (!existing.isActive || existing.role !== "OWNER") {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isActive: true, role: "OWNER" },
      });
    }
    return existing;
  }
  return prisma.user.create({
    data: {
      email,
      name,
      role: "OWNER",
      companyId,
      passwordHash: await bcrypt.hash(randomBytes(24).toString("base64"), 10),
    },
  });
}

const companyA = await upsertCompany(COMPANY_A_SLUG, "E2E Harness Co", {
  surchargeEnabled: true,
  surchargeRate: 0.03,
});
const ownerA = await upsertOwner(companyA.id, OWNER_A_EMAIL, "E2E Owner");

const companyB = await upsertCompany(COMPANY_B_SLUG, "E2E Tenant B");
const ownerB = await upsertOwner(companyB.id, OWNER_B_EMAIL, "E2E Tenant B Owner");

console.log(`Company A: ${companyA.id} (${COMPANY_A_SLUG}) owner ${ownerA.id}`);
console.log(`Company B: ${companyB.id} (${COMPANY_B_SLUG}) owner ${ownerB.id}`);

// ── Finix sandbox merchant for company A ────────────────────────────────────
if (
  process.env.FINIX_API_USERNAME &&
  process.env.FINIX_API_PASSWORD &&
  (process.env.FINIX_ENVIRONMENT ?? "sandbox") === "sandbox"
) {
  if (companyA.finixMerchantId && companyA.finixOnboardingState === "APPROVED") {
    console.log(`Company A merchant already provisioned: ${companyA.finixMerchantId}`);
  } else {
    const finix = await import("../lib/finix");
    const { identityId, merchantId, onboardingState } = await finix.provisionSandboxMerchant({
      businessName: "E2E Harness Co",
      email: OWNER_A_EMAIL,
      phone: "2145550100",
    });
    // Sandbox merchants approve in ~1-2 min; poll briefly, then stamp whatever
    // state we saw — the settings page re-sync self-heals later either way.
    let state = onboardingState;
    for (let i = 0; i < 12 && state !== "APPROVED"; i++) {
      await new Promise((r) => setTimeout(r, 10_000));
      state = (await finix.getMerchant(merchantId)).onboarding_state;
      console.log(`  merchant ${merchantId}: ${state}`);
    }
    await prisma.company.update({
      where: { id: companyA.id },
      data: {
        finixIdentityId: identityId,
        finixMerchantId: merchantId,
        finixOnboardingState: state,
      },
    });
    console.log(`Company A merchant: ${merchantId} (${state})`);
  }
} else {
  console.log("Finix sandbox creds not present — card-charge specs will be skipped.");
}

await prisma.$disconnect();
console.log("Provisioning complete.");
