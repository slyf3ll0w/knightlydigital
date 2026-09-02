#!/usr/bin/env node
/**
 * One-time migration for Online Booking v2 (idempotent, safe to re-run).
 *
 *   node scripts/migrate-booking-types.mjs            # dry run
 *   node scripts/migrate-booking-types.mjs --apply    # write
 *
 * For every company:
 *  - creates an INACTIVE "Phone call" (30 min) and "In-person estimate"
 *    (60 min) booking type with every currently bookable member in the
 *    pool, so the settings page isn't empty and turning on is one toggle;
 *  - for every BOOKING form with self-scheduling on, creates one SERVICE
 *    type per form service that maps to a price-book item with a duration
 *    (approval mode, matching today's behavior) and points the form at
 *    them via config.selfSchedule.bookingTypeIds.
 * Refuses to run if any company already has a form slugged "schedule"
 * (that word is now the public booking-menu route).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "booking";

async function uniqueSlug(companyId, base) {
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const clash = await prisma.bookingType.findFirst({ where: { companyId, slug }, select: { id: true } });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

async function main() {
  const clash = await prisma.webForm.findFirst({ where: { slug: "schedule" }, select: { companyId: true } });
  if (clash) {
    console.error(`A form is slugged "schedule" (company ${clash.companyId}) — rename it first.`);
    process.exit(1);
  }

  const companies = await prisma.company.findMany({
    select: { id: true, name: true, users: { where: { isActive: true, bookable: true }, select: { id: true } } },
  });
  let created = 0;
  for (const c of companies) {
    const existing = await prisma.bookingType.findMany({ where: { companyId: c.id }, select: { kind: true, slug: true } });
    const pool = c.users.map((u) => ({ userId: u.id }));

    const defaults = [
      { kind: "PHONE_CALL", name: "Phone call", durationMinutes: 30, stepMinutes: 30, bufferAfterMinutes: 0, leadHours: 2, clientCanReschedule: true, clientCanCancel: true, arrivalWindowMinutes: 0 },
      { kind: "IN_PERSON", name: "In-person estimate", durationMinutes: 60, stepMinutes: 30, bufferAfterMinutes: 15, leadHours: 4, clientCanReschedule: false, clientCanCancel: false, arrivalWindowMinutes: null },
    ];
    for (const d of defaults) {
      if (existing.some((e) => e.kind === d.kind)) continue;
      console.log(`${c.name}: + ${d.name} (inactive, pool ${pool.length})`);
      if (apply) {
        await prisma.bookingType.create({
          data: {
            companyId: c.id,
            slug: await uniqueSlug(c.id, slugify(d.name)),
            isActive: false,
            confirmation: "INSTANT",
            sortOrder: existing.length,
            ...d,
            members: { create: pool },
          },
        });
      }
      created++;
    }

    // Self-scheduling forms → SERVICE types
    const forms = await prisma.webForm.findMany({ where: { companyId: c.id, type: "BOOKING" } });
    for (const f of forms) {
      const cfg = f.config && typeof f.config === "object" ? f.config : {};
      const ss = cfg.selfSchedule && typeof cfg.selfSchedule === "object" ? cfg.selfSchedule : {};
      if (ss.enabled !== true) continue;
      if (Array.isArray(ss.bookingTypeIds) && ss.bookingTypeIds.length) continue; // already migrated
      const services = Array.isArray(cfg.services) ? cfg.services : [];
      const ids = [];
      for (const s of services) {
        if (!s?.workItemId) continue;
        const wi = await prisma.workItem.findFirst({ where: { id: s.workItemId, companyId: c.id, isActive: true }, select: { id: true, name: true, durationMinutes: true } });
        if (!wi?.durationMinutes) continue;
        console.log(`${c.name}: form "${f.name}" → service type "${wi.name}" (approval, ${wi.durationMinutes} min)`);
        if (apply) {
          const t = await prisma.bookingType.create({
            data: {
              companyId: c.id,
              slug: await uniqueSlug(c.id, slugify(wi.name)),
              name: wi.name,
              kind: "SERVICE",
              isActive: true,
              durationMinutes: wi.durationMinutes,
              stepMinutes: 30,
              bufferAfterMinutes: 0,
              leadHours: Number(ss.leadHours) || 4,
              horizonDays: Number(ss.horizonDays) || 30,
              confirmation: "APPROVAL",
              arrivalWindowMinutes: null,
              members: { create: pool },
              services: { create: [{ workItemId: wi.id, sortOrder: 0 }] },
            },
          });
          ids.push(t.id);
        }
        created++;
      }
      if (apply && ids.length) {
        await prisma.webForm.update({
          where: { id: f.id },
          data: { config: { ...cfg, selfSchedule: { ...ss, bookingTypeIds: ids } } },
        });
      }
    }
  }
  console.log(`${apply ? "Created" : "Would create"} ${created} booking type(s) across ${companies.length} companies.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
