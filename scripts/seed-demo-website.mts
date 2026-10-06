/**
 * Seed the client-websites demo company (idempotent) from the sites repo's
 * snapshot, so the Settings → Website / console / site-data endpoint can be
 * tested against a real account.
 *
 *   DATABASE_URL=<staging public url> npx tsx scripts/seed-demo-website.mts <path to site.json>
 *
 * Creates the company through createCompanySignup (same path as /apply),
 * pins the slug, fills the business facts, price book, two booking items
 * and the Website row (brief + IN_STUDIO + preview URL). Re-running updates
 * in place. Never run against production.
 */
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db";
import { createCompanySignup } from "../lib/signup";

const file = process.argv[2];
if (!file) {
  console.error("usage: seed-demo-website.mts <site.json>");
  process.exit(1);
}
if (/workbenchfsm\.com|prod/i.test(process.env.NEXTAUTH_URL ?? "")) {
  console.error("refusing: this looks like production");
  process.exit(1);
}
const snap = JSON.parse(await readFile(file, "utf8"));
const c = snap.company;
const slug: string = c.slug;
const OWNER_EMAIL = `demo-${slug}@workbenchfsm.com`;

let company = await prisma.company.findUnique({ where: { slug }, select: { id: true } });
if (!company) {
  const { companyId } = await createCompanySignup({
    companyName: c.name,
    industry: c.industry ?? null,
    owner: { newLogin: { email: OWNER_EMAIL, hash: await bcrypt.hash(randomBytes(24).toString("hex"), 10), name: "Ray Harlow" } },
    paymentsWaived: true,
    timezone: c.timezone ?? null,
  });
  await prisma.company.update({ where: { id: companyId }, data: { slug } });
  company = { id: companyId };
  console.log(`created company ${companyId} (${slug})`);
} else console.log(`company exists ${company.id} (${slug})`);
const companyId = company.id;

await prisma.company.update({
  where: { id: companyId },
  data: {
    name: c.name,
    legalName: c.legalName,
    phone: c.phone,
    email: c.email,
    address: c.address,
    city: c.city,
    state: c.state,
    zip: c.zip,
    lat: c.lat,
    lng: c.lng,
    about: c.about,
    industry: c.industry,
    timezone: c.timezone,
    brandColor: c.brandColor,
    brandColorSecondary: c.brandColorSecondary,
    reviewLink: c.reviewLink,
    businessHours: c.hours,
    isTest: true,
  },
});

// Price book: the snapshot's services, everything else from the starter book off
const names = new Set<string>(snap.services.map((s: { name: string }) => s.name));
await prisma.workItem.updateMany({ where: { companyId, name: { notIn: [...names] } }, data: { isActive: false } });
for (const s of snap.services) {
  const existing = await prisma.workItem.findFirst({ where: { companyId, name: s.name }, select: { id: true } });
  const data = { name: s.name, description: s.description, unitPrice: s.price ?? 0, priceDisplay: s.price == null ? "QUOTE" : s.priceDisplay, type: "SERVICE" as const, isActive: true };
  if (existing) await prisma.workItem.update({ where: { id: existing.id }, data });
  else await prisma.workItem.create({ data: { companyId, ...data } });
}

// Booking items: one scheduled visit, one message form
const owner = await prisma.user.findFirst({ where: { companyId, role: "OWNER" }, select: { id: true } });
for (const item of snap.booking.items) {
  const existing = await prisma.bookingType.findFirst({ where: { companyId, slug: item.slug }, select: { id: true } });
  const data = { name: item.name, description: item.description, kind: item.kind, mode: item.mode, isActive: true, showOnPage: true };
  const row = existing
    ? await prisma.bookingType.update({ where: { id: existing.id }, data })
    : await prisma.bookingType.create({ data: { companyId, slug: item.slug, ...data } });
  if (owner && item.mode === "SCHEDULE") {
    const m = await prisma.bookingTypeMember.findFirst({ where: { bookingTypeId: row.id, userId: owner.id } });
    if (!m) await prisma.bookingTypeMember.create({ data: { bookingTypeId: row.id, userId: owner.id } });
  }
}

await prisma.website.upsert({
  where: { companyId },
  create: { companyId, brief: snap.brief, status: "IN_STUDIO", briefSubmittedAt: new Date(), previewUrl: snap.website?.previewUrl ?? null, direction: snap.website?.direction ?? null, pagesProject: `wb-${slug}` },
  update: { brief: snap.brief, previewUrl: snap.website?.previewUrl ?? undefined, direction: snap.website?.direction ?? undefined, pagesProject: `wb-${slug}` },
});
console.log(`seeded ${slug}: ${names.size} services, ${snap.booking.items.length} booking items, website row IN_STUDIO`);
await prisma.$disconnect();
