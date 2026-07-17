import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, isManager } from "@/lib/permissions";
import { normalizePhone } from "@/lib/csv";
import { getActiveFieldDefs, sanitizeCustomFields } from "@/lib/contact-fields";

/**
 * CSV client import (manager-only).
 *
 * POST — one chunk of mapped rows (≤200). Dedupes against existing contacts
 * by normalized email or phone; duplicateMode decides skip vs update.
 * Created contacts carry importBatchId so the whole batch can be undone.
 *
 * DELETE ?batchId= — undo an import: removes batch contacts that have no
 * real work attached (same guard as spam delete).
 */

const MAX_ROWS_PER_CHUNK = 200;

type ImportRow = {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  leadSource?: string;
  customFields?: Record<string, string>;
};

const trim = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

export async function POST(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const body = await req.json();
  const rows: ImportRow[] = Array.isArray(body.rows) ? body.rows : [];
  const batchId: string = typeof body.batchId === "string" ? body.batchId.slice(0, 64) : "";
  const duplicateMode: "skip" | "update" = body.duplicateMode === "update" ? "update" : "skip";
  const statusForNew: "LEAD" | "ACTIVE" = body.status === "ACTIVE" ? "ACTIVE" : "LEAD";

  if (!batchId) return NextResponse.json({ error: "Missing batch id." }, { status: 400 });
  if (rows.length === 0) return NextResponse.json({ error: "No rows." }, { status: 400 });
  if (rows.length > MAX_ROWS_PER_CHUNK) {
    return NextResponse.json({ error: `Send at most ${MAX_ROWS_PER_CHUNK} rows per request.` }, { status: 400 });
  }

  let assignedToId = actor.id;
  if (body.assignedToId) {
    const target = await prisma.user.findFirst({
      where: { id: body.assignedToId, companyId, isActive: true },
      select: { id: true },
    });
    if (target) assignedToId = target.id;
  }

  const fieldDefs = await getActiveFieldDefs(companyId);

  // Existing contacts once per chunk — match on normalized email/phone
  const existing = await prisma.contact.findMany({
    where: { companyId },
    select: { id: true, email: true, phone: true },
  });
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();
  for (const c of existing) {
    if (c.email) byEmail.set(c.email.trim().toLowerCase(), c.id);
    const p = normalizePhone(c.phone);
    if (p.length >= 7) byPhone.set(p, c.id);
  }

  let created = 0;
  let updated = 0;
  let skippedDuplicates = 0;
  const errors: { row: number; reason: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const firstName = trim(r.firstName, 80);
    const lastName = trim(r.lastName, 80);
    const companyName = trim(r.companyName, 120);
    if (!firstName && !lastName && !companyName) {
      errors.push({ row: i, reason: "No name" });
      continue;
    }

    const email = trim(r.email, 254)?.toLowerCase() ?? null;
    const phone = trim(r.phone, 30);
    const normPhone = normalizePhone(phone);

    const data = {
      firstName: firstName ?? companyName ?? "—",
      lastName: lastName ?? "",
      companyName,
      email,
      phone,
      address: trim(r.address, 200),
      city: trim(r.city, 80),
      state: trim(r.state, 40),
      zip: trim(r.zip, 20),
      notes: trim(r.notes, 2000),
      leadSource: trim(r.leadSource, 80) ?? "Imported",
    };
    const customFields = sanitizeCustomFields(r.customFields, fieldDefs);

    const matchId =
      (email && byEmail.get(email)) || (normPhone.length >= 7 && byPhone.get(normPhone)) || null;

    try {
      if (matchId) {
        if (duplicateMode === "skip") {
          skippedDuplicates++;
          continue;
        }
        // update: fill fields, don't blank existing values with empty cells
        const patch: Record<string, unknown> = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== null && v !== "")
        );
        if (Object.keys(customFields).length > 0) {
          const cur = await prisma.contact.findUnique({
            where: { id: matchId },
            select: { customFields: true },
          });
          patch.customFields = {
            ...((cur?.customFields as Record<string, string>) ?? {}),
            ...customFields,
          };
        }
        await prisma.contact.update({ where: { id: matchId }, data: patch });
        updated++;
      } else {
        const contact = await prisma.contact.create({
          data: {
            companyId,
            ...data,
            customFields,
            status: statusForNew,
            assignedToId,
            importBatchId: batchId,
          },
        });
        if (email) byEmail.set(email, contact.id);
        if (normPhone.length >= 7) byPhone.set(normPhone, contact.id);
        created++;
      }
    } catch {
      errors.push({ row: i, reason: "Could not save" });
    }
  }

  return NextResponse.json({ created, updated, skippedDuplicates, errors });
}

export async function DELETE(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManager(actor.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const companyId = actor.companyId;

  const batchId = req.nextUrl.searchParams.get("batchId");
  if (!batchId) return NextResponse.json({ error: "Missing batch id." }, { status: 400 });

  const batch = await prisma.contact.findMany({
    where: { companyId, importBatchId: batchId },
    include: {
      _count: {
        select: { quotes: true, jobs: true, invoices: true, payments: true, subscriptions: true, appointments: true },
      },
    },
  });

  const removable = batch.filter((c) => {
    const n = c._count;
    return (
      n.quotes === 0 && n.jobs === 0 && n.invoices === 0 && n.payments === 0 &&
      n.subscriptions === 0 && n.appointments === 0
    );
  });
  const ids = removable.map((c) => c.id);

  if (ids.length > 0) {
    await prisma.$transaction([
      prisma.request.deleteMany({ where: { companyId, contactId: { in: ids } } }),
      prisma.bookingRequest.deleteMany({ where: { companyId, contactId: { in: ids } } }),
      prisma.contact.deleteMany({ where: { companyId, id: { in: ids } } }),
    ]);
  }

  return NextResponse.json({ deleted: ids.length, kept: batch.length - ids.length });
}
