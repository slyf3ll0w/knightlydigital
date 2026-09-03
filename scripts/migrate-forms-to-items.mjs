#!/usr/bin/env node
/**
 * Online booking v3 — one list. Folds every WebForm into a BookingType
 * ("item") so the settings page has one list and the public page one look.
 * Idempotent: an item remembers the form it came from (legacyFormId).
 *
 *   node scripts/migrate-forms-to-items.mjs            # dry run
 *   node scripts/migrate-forms-to-items.mjs --apply    # write
 *   (against prod: node scripts/run-with-prod-db.mjs scripts/migrate-forms-to-items.mjs --apply)
 *
 * Per company:
 *  - Company.bookingPage ← the default form's appearance + header (once).
 *  - INQUIRY form        → MESSAGE item, request mode.
 *  - BOOKING form        → IN_PERSON item, request mode, with the
 *                          preferred-date question — unless it had
 *                          self-scheduling on, in which case its questions
 *                          and words move onto the booking types it pointed
 *                          at (they already exist) and the first of them
 *                          inherits the form's slug.
 *  - SERVICE_REQUEST     → SERVICE item, request mode (draft/send quote);
 *                          services not in the price book get a price-book
 *                          row so they can be attached.
 *  Every item keeps the form's slug so pasted links and iframes keep
 *  working; only the default form's item shows on the booking page, so
 *  /book/[slug] renders exactly what it rendered before.
 *  - Companies with no forms at all get one "Free estimate" request item
 *    (the old on-the-fly default form).
 *  - The inactive, untouched "Phone call" / "In-person estimate" defaults
 *    seeded by the v2 migration are deleted (never edited, never booked).
 * WebForm rows are left in place; drop the table in a later release.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "booking";
const RESERVED = new Set(["schedule", "manage", "new", "embed"]);

async function uniqueSlug(companyId, base, exceptId = null) {
  let slug = RESERVED.has(base) ? `${base}-1` : base;
  for (let i = 2; i < 50; i++) {
    const clash = await prisma.bookingType.findFirst({
      where: { companyId, slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (!clash) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now()}`;
}

/** Give `slug` to `wantedBy` (an item id, or null for a new item): any other item holding it moves aside. */
async function claimSlug(companyId, slug, wantedBy, log) {
  const holder = await prisma.bookingType.findFirst({ where: { companyId, slug }, select: { id: true, name: true } });
  if (!holder || holder.id === wantedBy) return;
  const next = await uniqueSlug(companyId, `${slug}-2`, holder.id);
  log(`  · item "${holder.name}" moves from /${slug} to /${next} (the form's link wins)`);
  if (apply) await prisma.bookingType.update({ where: { id: holder.id }, data: { slug: next } });
}

const str = (v, max) => (typeof v === "string" ? v.slice(0, max).trim() : "");

function stdField(raw, key, legacyShow, dflt) {
  const f = raw?.[key];
  if (!f || typeof f !== "object") return { show: legacyShow, required: dflt.required, label: dflt.label };
  return { show: f.show !== false, required: f.required === true, label: str(f.label, 60) || dflt.label };
}

/** The form's config → an item's intake JSON (same shape as lib/booking-intake.ts). */
function intakeFromConfig(cfg, formType) {
  const fields = cfg.fields ?? {};
  const legacyAddress = cfg.showAddress !== false;
  const legacyDate = cfg.showPreferredDate !== false;
  const svc = cfg.service ?? {};
  const msg = cfg.message ?? {};
  const customFields = (Array.isArray(cfg.customFields) ? cfg.customFields : []).slice(0, 10).map((f, i) => ({
    id: str(f?.id, 40) || `field-${i}`,
    label: str(f?.label, 60),
    type: ["textarea", "select", "radio"].includes(f?.type) ? f.type : "text",
    required: f?.required === true,
    ...(str(f?.placeholder, 120) ? { placeholder: str(f.placeholder, 120) } : {}),
    ...(Array.isArray(f?.options)
      ? { options: f.options.map((o) => ({ label: str(o?.label, 80), ...(str(o?.description, 140) ? { description: str(o.description, 140) } : {}) })).filter((o) => o.label) }
      : {}),
    ...(str(f?.contactFieldId, 40) ? { contactFieldId: str(f.contactFieldId, 40) } : {}),
  })).filter((f) => f.label);
  return {
    heading: str(cfg.header?.title, 100),
    buttonLabel: str(cfg.button?.label, 40),
    fields: {
      email: stdField(fields, "email", true, { required: false, label: "Email" }),
      phone: stdField(fields, "phone", true, { required: true, label: "Phone" }),
      address: stdField(fields, "address", legacyAddress, { required: false, label: "Service address" }),
      date: stdField(fields, "date", legacyDate && formType !== "INQUIRY" && formType !== "SERVICE_REQUEST", { required: false, label: "Preferred date" }),
    },
    message: {
      show: msg.show !== false,
      required: msg.required === true,
      label: str(msg.label, 60) || "Message",
      placeholder: str(msg.placeholder, 200) || "Any additional details...",
    },
    serviceQuestion: {
      show: formType !== "SERVICE_REQUEST" && svc.show !== false && !(formType === "INQUIRY" && svc.show === undefined),
      required: svc.required !== false,
      label: str(svc.label, 60) || "Service needed",
      type: svc.type === "select" || svc.type === "radio" ? svc.type : "text",
      placeholder: str(svc.placeholder, 120),
      options: (Array.isArray(svc.options) ? svc.options : []).map((o) => ({ label: str(o?.label, 80), ...(str(o?.description, 140) ? { description: str(o.description, 140) } : {}) })).filter((o) => o.label),
    },
    customFields,
    quoteMode: cfg.serviceRequest?.quoteMode === "send" || cfg.serviceRequest?.invoiceMode === "send" ? "send" : "draft",
    allowMultiple: cfg.serviceRequest?.allowMultiple === true,
  };
}

function lookFromConfig(cfg) {
  const a = cfg.appearance ?? {};
  const color = str(cfg.button?.color, 7);
  return {
    theme: a.theme === "dark" || a.theme === "transparent" ? a.theme : "light",
    ...(str(a.font, 40) ? { font: str(a.font, 40) } : {}),
    fontSize: a.fontSize === "sm" || a.fontSize === "lg" ? a.fontSize : "md",
    ...(/^#[0-9a-fA-F]{6}$/.test(color) ? { accent: color } : {}),
    title: str(cfg.header?.title, 100),
    description: str(cfg.header?.description, 300),
  };
}

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, slug: true, bookingPage: true, users: { where: { isActive: true, bookable: true }, select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  let items = 0, updated = 0, pruned = 0;
  for (const c of companies) {
    const log = (m) => console.log(`${c.name}: ${m}`.replace(`${c.name}:   `, "  "));
    const pool = c.users.map((u) => ({ userId: u.id }));
    const forms = await prisma.webForm.findMany({ where: { companyId: c.id }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
    const defaultForm = forms.find((f) => f.isDefault) ?? forms[0] ?? null;

    // Page look, once
    if (!c.bookingPage && defaultForm) {
      const look = lookFromConfig(defaultForm.config ?? {});
      log(`page look ← form "${defaultForm.name}" (${look.theme}${look.font ? `, ${look.font}` : ""}${look.accent ? `, ${look.accent}` : ""})`);
      if (apply) await prisma.company.update({ where: { id: c.id }, data: { bookingPage: look } });
    }

    let order = 0;
    for (const f of forms) {
      const already = await prisma.bookingType.findFirst({ where: { legacyFormId: f.id }, select: { id: true } });
      if (already) { order++; continue; }
      const cfg = f.config && typeof f.config === "object" ? f.config : {};
      const ss = cfg.selfSchedule && typeof cfg.selfSchedule === "object" ? cfg.selfSchedule : {};
      const intake = intakeFromConfig(cfg, f.type);
      const onPage = f.isDefault;

      if (f.type === "BOOKING" && ss.enabled === true && Array.isArray(ss.bookingTypeIds) && ss.bookingTypeIds.length) {
        // Self-scheduling form: its types exist; carry words + questions onto them
        const types = await prisma.bookingType.findMany({ where: { companyId: c.id, id: { in: ss.bookingTypeIds } }, orderBy: { sortOrder: "asc" } });
        for (const [i, t] of types.entries()) {
          const first = i === 0;
          log(`form "${f.name}" (self-scheduling) → item "${t.name}": questions + words carried, ${onPage ? "on page" : "link only"}${first && !f.isDefault ? `, takes link /${f.slug}` : ""}`);
          if (first && !f.isDefault) await claimSlug(c.id, f.slug, t.id, log);
          if (apply) {
            await prisma.bookingType.update({
              where: { id: t.id },
              data: {
                intake: { ...intake, fields: { ...intake.fields, date: { ...intake.fields.date, show: false } } },
                showOnPage: onPage,
                sortOrder: order++,
                ...(first ? { legacyFormId: f.id } : {}),
                ...(first && !f.isDefault ? { slug: f.slug } : {}),
              },
            });
          }
          updated++;
        }
        continue;
      }

      const kind = f.type === "INQUIRY" ? "MESSAGE" : f.type === "SERVICE_REQUEST" ? "SERVICE" : "IN_PERSON";
      // Services: price-book rows, created when the form only had a snapshot
      const serviceRows = [];
      if (kind === "SERVICE") {
        for (const [i, s] of (Array.isArray(cfg.services) ? cfg.services : []).entries()) {
          const name = str(s?.name, 100);
          if (!name) continue;
          let wi = s?.workItemId ? await prisma.workItem.findFirst({ where: { id: s.workItemId, companyId: c.id }, select: { id: true, isActive: true } }) : null;
          if (wi && !wi.isActive) {
            log(`  · price-book item "${name}" is archived — restoring it so the form's service survives`);
            if (apply) await prisma.workItem.update({ where: { id: wi.id }, data: { isActive: true } });
          }
          if (!wi) {
            const price = Number(s?.price);
            log(`  · price-book row created for "${name}" ($${Number.isFinite(price) ? price.toFixed(2) : "0.00"})`);
            if (apply) {
              wi = await prisma.workItem.create({
                data: {
                  companyId: c.id,
                  name,
                  type: "SERVICE",
                  unitPrice: Number.isFinite(price) && price >= 0 ? price : 0,
                  priceDisplay: ["FIXED", "STARTING_AT", "HOURLY", "QUOTE"].includes(s?.priceDisplay) ? s.priceDisplay : "FIXED",
                  description: str(s?.description, 200) || null,
                },
                select: { id: true, isActive: true },
              });
            } else wi = { id: `new-${i}` };
          }
          serviceRows.push({ workItemId: wi.id, sortOrder: i });
        }
      }
      const slug = f.isDefault ? await uniqueSlug(c.id, f.slug) : f.slug;
      log(`form "${f.name}" (${f.type}${f.isActive ? "" : ", off"}) → ${kind} item, request mode, /${slug}, ${onPage ? "on page" : "link only"}${serviceRows.length ? `, ${serviceRows.length} service(s)` : ""}`);
      if (!f.isDefault) await claimSlug(c.id, f.slug, null, log);
      if (apply) {
        await prisma.bookingType.create({
          data: {
            companyId: c.id,
            legacyFormId: f.id,
            slug,
            name: f.name,
            description: str(cfg.header?.description, 500) || null,
            kind,
            mode: "REQUEST",
            isActive: f.isActive,
            showOnPage: onPage,
            sortOrder: order++,
            durationMinutes: kind === "MESSAGE" ? 30 : 60,
            stepMinutes: 30,
            bufferAfterMinutes: kind === "MESSAGE" ? 0 : 15,
            leadHours: 4,
            horizonDays: 30,
            confirmation: "INSTANT",
            arrivalWindowMinutes: null,
            clientCanReschedule: false,
            clientCanCancel: false,
            intake,
            members: { create: pool },
            ...(serviceRows.length ? { services: { create: serviceRows } } : {}),
          },
        });
      }
      items++;
    }

    // No forms at all → the old on-the-fly default form
    if (forms.length === 0) {
      const count = await prisma.bookingType.count({ where: { companyId: c.id, mode: "REQUEST" } });
      if (count === 0) {
        log(`no forms → "Free estimate" request item (the old default form)`);
        if (apply) {
          await prisma.bookingType.create({
            data: {
              companyId: c.id,
              slug: await uniqueSlug(c.id, "free-estimate"),
              name: "Free estimate",
              kind: "IN_PERSON",
              mode: "REQUEST",
              isActive: true,
              showOnPage: true,
              sortOrder: 0,
              durationMinutes: 60,
              bufferAfterMinutes: 15,
              leadHours: 4,
              horizonDays: 30,
              confirmation: "INSTANT",
              members: { create: pool },
            },
          });
        }
        items++;
      }
    }

    // Prune the untouched v2 defaults (inactive, never booked, never renamed)
    const sleepers = await prisma.bookingType.findMany({
      where: {
        companyId: c.id,
        isActive: false,
        legacyFormId: null,
        name: { in: ["Phone call", "In-person estimate"] },
        kind: { in: ["PHONE_CALL", "IN_PERSON"] },
        appointments: { none: {} },
        jobs: { none: {} },
        requests: { none: {} },
      },
      select: { id: true, name: true },
    });
    for (const s of sleepers) {
      log(`delete sleeping default "${s.name}"`);
      if (apply) await prisma.bookingType.delete({ where: { id: s.id } });
      pruned++;
    }
  }
  console.log(
    `${apply ? "Done" : "Dry run"}: ${items} item(s) created, ${updated} existing type(s) updated, ${pruned} sleeping default(s) removed across ${companies.length} companies.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
