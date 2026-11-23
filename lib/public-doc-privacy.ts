/**
 * Whose details a public pay / quote page may show.
 *
 * A shop order or a website booking is started by whoever fills in the form,
 * and it attaches to an EXISTING client when the typed phone or email matches
 * one (no duplicate records). The link that comes back is then a page about
 * that client, so a stranger who only knows a client's phone number would be
 * shown their name, email and street address. For a document a stranger
 * could have started against a client who was already on file, the public
 * page and its PDF show the business and the items and nothing about the
 * client (2026-11-23 security review, David's choice). The team's own
 * screens and PDFs are unchanged, and a brand-new contact made from the
 * form still sees what they typed.
 */
import { prisma } from "@/lib/db";

/** How long before the document a contact may have been made and still count as "made by this form". */
const SAME_SUBMIT_MS = 2 * 60_000;

/** Request sources that are an open form on the internet. */
const OPEN_FORM_SOURCES = new Set(["booking_form", "estimate_form"]);

/** Pure: was this document started from an open form against a client already on file? */
export function withholdsClient(doc: {
  /** A shop order, or a quote whose request came in through an open form. */
  openForm: boolean;
  docCreatedAt: Date;
  contactCreatedAt: Date | null;
}): boolean {
  if (!doc.openForm || !doc.contactCreatedAt) return false;
  return doc.contactCreatedAt.getTime() < doc.docCreatedAt.getTime() - SAME_SUBMIT_MS;
}

export async function publicInvoiceWithholdsClient(publicToken: string): Promise<boolean> {
  const inv = await prisma.invoice.findFirst({
    where: { publicToken },
    select: { kind: true, createdAt: true, contact: { select: { createdAt: true } } },
  });
  if (!inv) return false;
  return withholdsClient({ openForm: inv.kind === "STORE_ORDER", docCreatedAt: inv.createdAt, contactCreatedAt: inv.contact?.createdAt ?? null });
}

export async function publicQuoteWithholdsClient(publicToken: string): Promise<boolean> {
  const q = await prisma.quote.findFirst({
    where: { publicToken },
    select: { createdAt: true, request: { select: { source: true } }, contact: { select: { createdAt: true } } },
  });
  if (!q) return false;
  return withholdsClient({
    openForm: Boolean(q.request && OPEN_FORM_SOURCES.has(q.request.source)),
    docCreatedAt: q.createdAt,
    contactCreatedAt: q.contact?.createdAt ?? null,
  });
}
