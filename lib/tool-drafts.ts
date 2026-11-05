import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { nextInvoiceNumber, nextQuoteNumber, withDocNumberRetry } from "@/lib/doc-numbers";
import { computeQuoteTotals } from "@/lib/quote-totals";
import { reportError } from "@/lib/report-error";
import { MAX_LOGO_BYTES, sanitizeToolDoc, splitName, type ToolDoc } from "@/lib/tool-doc";

/**
 * A document from the free generator (/tools/*) on its way into a real
 * account. createToolDraft stores it; /apply?draft=<id> pre-fills the
 * sign-up form from it; claimToolDraft (called by the apply API once the
 * company exists) turns it into a DRAFT Invoice or Quote on a new Contact,
 * and adopts the logo, address and tax rate as the company's own where the
 * company has none. Everything here is best effort around the sign-up —
 * a bad draft never blocks an account from opening.
 */

export const DRAFT_TTL_DAYS = 14;

export type ParsedLogo = { data: Buffer; mime: "image/png" | "image/jpeg"; format: "png" | "jpg" };

/** A data: URL from the browser → bytes. PNG and JPEG only (react-pdf renders nothing else). */
export function parseLogoDataUrl(input: unknown): ParsedLogo | null {
  if (typeof input !== "string") return null;
  const m = /^data:(image\/png|image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(input.trim());
  if (!m) return null;
  const data = Buffer.from(m[2], "base64");
  if (data.length === 0 || data.length > MAX_LOGO_BYTES) return null;
  const mime = m[1] as ParsedLogo["mime"];
  return { data, mime, format: mime === "image/png" ? "png" : "jpg" };
}

export async function createToolDraft(input: { doc: unknown; logo?: unknown; ip?: string | null }): Promise<{ id: string } | null> {
  const doc = sanitizeToolDoc(input.doc);
  if (!doc) return null;
  const logo = parseLogoDataUrl(input.logo);
  const row = await prisma.toolDraft.create({
    data: {
      kind: doc.kind === "estimate" ? "QUOTE" : "INVOICE",
      data: doc as object,
      logoData: logo?.data ?? null,
      logoMime: logo?.mime ?? null,
      ip: input.ip && input.ip !== "unknown" ? input.ip : null,
    },
    select: { id: true },
  });
  return row;
}

export type DraftPrefill = {
  id: string;
  kind: ToolDoc["kind"];
  companyName: string;
  email: string;
  phone: string;
};

/** What the sign-up form may pre-fill from a draft (nothing about the client). */
export async function draftPrefill(id: string | undefined | null): Promise<DraftPrefill | null> {
  if (!id || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  const row = await prisma.toolDraft.findUnique({ where: { id }, select: { id: true, data: true, claimedAt: true, createdAt: true } });
  if (!row || row.claimedAt || Date.now() - row.createdAt.getTime() > DRAFT_TTL_DAYS * 86_400_000) return null;
  const doc = sanitizeToolDoc(row.data);
  if (!doc) return null;
  return { id: row.id, kind: doc.kind, companyName: doc.business.name, email: doc.business.email, phone: doc.business.phone };
}

/**
 * Turn the stored draft into the new company's first document. Runs after
 * createCompanySignup; returns what was made, or null when nothing was.
 */
export async function claimToolDraft(id: string | undefined | null, companyId: string, userId: string): Promise<{ invoiceId?: string; quoteId?: string } | null> {
  if (!id || !/^[a-z0-9]{10,40}$/i.test(id)) return null;
  try {
    // Claim first (atomic), so two sign-ups with the same link can't both take it.
    const claimed = await prisma.toolDraft.updateMany({
      where: { id, claimedAt: null, createdAt: { gte: new Date(Date.now() - DRAFT_TTL_DAYS * 86_400_000) } },
      data: { claimedAt: new Date(), companyId },
    });
    if (claimed.count !== 1) return null;
    const row = await prisma.toolDraft.findUnique({ where: { id } });
    if (!row) return null;
    const doc = sanitizeToolDoc(row.data);
    if (!doc) return null;

    // The company's own details, where it has none yet.
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { phone: true, address: true, city: true, state: true, zip: true, logoData: true, logoUrl: true, defaultTaxRate: true, brandColor: true },
    });
    if (company) {
      const b = doc.business;
      const data: Record<string, unknown> = {};
      if (!company.phone && b.phone) data.phone = b.phone;
      if (!company.address && b.address) {
        data.address = b.address;
        if (b.city) data.city = b.city;
        if (b.state) data.state = b.state;
        if (b.zip) data.zip = b.zip;
      }
      if (company.defaultTaxRate == null && doc.taxRate > 0) data.defaultTaxRate = doc.taxRate / 100;
      if (!company.logoData && !company.logoUrl && row.logoData && row.logoMime) {
        data.logoData = row.logoData;
        data.logoMime = row.logoMime;
        data.logoUrl = `/api/logo/${companyId}`;
      }
      if (Object.keys(data).length) await prisma.company.update({ where: { id: companyId }, data });
    }

    // The client on the document becomes the first Contact (a client, not a lead).
    let contactId: string | null = null;
    const c = doc.client;
    if (c.name.trim()) {
      const { firstName, lastName } = splitName(c.name);
      const contact = await prisma.contact.create({
        data: {
          companyId,
          hubToken: randomBytes(24).toString("hex"),
          status: "ACTIVE",
          kind: "CLIENT",
          firstName: firstName || c.name.trim(),
          lastName,
          email: c.email || null,
          phone: c.phone || null,
          address: c.address || null,
          city: c.city || null,
          state: c.state || null,
          zip: c.zip || null,
          leadSource: "Free tool",
          createdById: userId,
        },
        select: { id: true },
      });
      contactId = contact.id;
    }

    const subtotal = Math.round(doc.lines.reduce((s, l) => s + Math.round(l.quantity * l.unitPrice * 100) / 100, 0) * 100) / 100;
    const taxRate = doc.taxRate > 0 ? doc.taxRate / 100 : null;
    const { discount, tax, total } = computeQuoteTotals({ subtotal, discountType: doc.discountType, discountValue: doc.discountValue, taxRate });
    const lineData = doc.lines.map((l, i) => ({
      name: l.name || l.description.slice(0, 80) || "Item",
      description: l.name ? l.description : "",
      quantity: Math.max(1, Math.round(l.quantity)),
      unitPrice: l.unitPrice,
      total: Math.round(Math.max(1, Math.round(l.quantity)) * l.unitPrice * 100) / 100,
      sortOrder: i,
    }));
    const issuedAt = new Date(doc.issuedAt + "T12:00:00");
    const dueAt = doc.dueAt ? new Date(doc.dueAt + "T12:00:00") : null;

    if (doc.kind === "estimate") {
      if (!contactId) {
        // A quote needs a client. Make a placeholder named after the document.
        const contact = await prisma.contact.create({
          data: { companyId, hubToken: randomBytes(24).toString("hex"), status: "ACTIVE", kind: "CLIENT", firstName: "Estimate", lastName: `#${doc.number}`, leadSource: "Free tool", createdById: userId },
          select: { id: true },
        });
        contactId = contact.id;
      }
      const quote = await withDocNumberRetry(() =>
        prisma.$transaction(async (tx) => {
          const quoteNumber = await nextQuoteNumber(tx, companyId);
          return tx.quote.create({
            data: {
              companyId,
              contactId: contactId!,
              publicToken: randomBytes(24).toString("hex"),
              quoteNumber,
              title: doc.lines[0]?.name || "Estimate",
              subtotal,
              discountType: doc.discountType,
              discountValue: doc.discountType === "NONE" ? null : doc.discountValue,
              discount,
              taxRate,
              tax,
              total,
              depositType: doc.depositType,
              depositValue: doc.depositType === "NONE" ? null : doc.depositValue,
              clientMessage: doc.clientMessage || null,
              validUntil: dueAt,
              lineItems: { create: lineData.map((l, i) => ({ ...l, isOptional: doc.lines[i]?.optional ?? false })) },
            },
            select: { id: true },
          });
        }),
      );
      await prisma.toolDraft.update({ where: { id }, data: { quoteId: quote.id } });
      return { quoteId: quote.id };
    }

    const invoice = await withDocNumberRetry(() =>
      prisma.$transaction(async (tx) => {
        const invoiceNumber = await nextInvoiceNumber(tx, companyId);
        return tx.invoice.create({
          data: {
            companyId,
            contactId,
            publicToken: randomBytes(24).toString("hex"),
            invoiceNumber,
            subject: doc.lines[0]?.name || null,
            subtotal,
            discountType: doc.discountType,
            discountValue: doc.discountType === "NONE" ? null : doc.discountValue,
            discount,
            taxRate,
            tax,
            total,
            clientMessage: doc.clientMessage || null,
            issuedAt,
            dueDate: dueAt,
            lineItems: { create: lineData },
          },
          select: { id: true },
        });
      }),
    );
    await prisma.toolDraft.update({ where: { id }, data: { invoiceId: invoice.id } });
    return { invoiceId: invoice.id };
  } catch (e) {
    reportError("[tool-drafts] claim failed", e);
    return null;
  }
}

/** Unclaimed drafts older than the TTL, and claimed ones after 90 days (the document lives in the account now). */
export async function runToolDraftSweep(now = new Date()): Promise<number> {
  const ttl = new Date(now.getTime() - DRAFT_TTL_DAYS * 86_400_000);
  const old = new Date(now.getTime() - 90 * 86_400_000);
  const r = await prisma.toolDraft.deleteMany({
    where: { OR: [{ claimedAt: null, createdAt: { lt: ttl } }, { claimedAt: { lt: old } }] },
  });
  return r.count;
}
