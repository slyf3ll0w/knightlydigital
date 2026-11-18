// Local copy of Steadfast Outdoor Living Co. (mirrors the real, brand-new prod account) for app b-roll.
// Run from the REPO ROOT against the LOCAL database only (.env.local → DATABASE_URL on localhost):
//   npx tsx marketing/videos/scripts/seed-steadfast.mts
// Writes marketing/videos/token.json (a session cookie for scripts/record-app.mjs).
import fs from "node:fs";
import { prisma } from "@/lib/db";
import { createCompanySignup } from "@/lib/signup";
import { encode } from "next-auth/jwt";
// SAFETY: this creates a company + login. Never against staging/prod.
const dbHost = new URL(process.env.DATABASE_URL ?? "postgres://x@nowhere/x").hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) throw new Error(`Refusing to seed: DATABASE_URL host is ${dbHost}, not localhost`);
// Mirrors the real account through its public site-data endpoint (no prod login needed)
const D = await (await fetch("https://workbenchfsm.com/api/public/site/steadfast-outdoor-living")).json();
let company = await prisma.company.findFirst({ where: { name: "Steadfast Outdoor Living Co." } });
if (!company) {
  const { companyId } = await createCompanySignup({
    companyName: "Steadfast Outdoor Living Co.", industry: "Pressure Washing", paymentsWaived: true, timezone: "America/Chicago",
    owner: { newLogin: { email: "david@steadfast.test", name: "David Lessly", hash: "x" } } as any,
  });
  company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
}
const logo = Buffer.from(await (await fetch(D.company.logoUrl)).arrayBuffer());
await prisma.company.update({
  where: { id: company.id },
  data: {
    slug: D.company.slug, phone: D.company.phone, website: D.company.website, brandColor: D.company.brandColor, brandColorSecondary: D.company.brandColorSecondary,
    businessHours: D.company.hours, logoData: logo, logoMime: "image/png", logoUrl: `/api/logo/${company.id}?v=1`,
  },
});
// price book = the real account's 8 services
await prisma.workItem.deleteMany({ where: { companyId: company.id } }).catch(() => {});
for (const s of D.services) await prisma.workItem.create({ data: { companyId: company.id, name: s.name, description: s.description, ...(s.priceDisplay ? { priceDisplay: s.priceDisplay } : {}) } as any });
// booking page items
for (const [i, b] of D.booking.items.entries())
  await prisma.bookingType.upsert({
    where: { companyId_slug: { companyId: company.id, slug: b.slug } },
    update: {},
    create: { companyId: company.id, name: b.name, slug: b.slug, kind: b.kind, mode: b.mode, sortOrder: i, durationMinutes: 30 },
  });
await prisma.website.upsert({ where: { companyId: company.id }, update: {}, create: { companyId: company.id, status: "IN_STUDIO", brief: D.brief, briefSubmittedAt: new Date() } });
const owner = await prisma.user.findFirstOrThrow({ where: { companyId: company.id, role: "OWNER" } });
await prisma.user.update({ where: { id: owner.id }, data: { name: "David Lessly", tourCompletedAt: new Date() } as any });
const token = await encode({ token: { name: owner.name, email: owner.email, sub: owner.id, id: owner.id, role: owner.role, companyId: company.id, companyName: company.name, accountId: owner.accountId, authAt: Date.now() }, secret: process.env.AUTH_SECRET!, maxAge: 60 * 60 * 24 * 30 });
fs.writeFileSync("marketing/videos/token.json", JSON.stringify({ userId: owner.id, companyId: company.id, token }));
console.log("seeded", company.id, company.slug);
process.exit(0);
