import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getActor,
  canSell,
  canSeeMoney,
  contactScope,
  viaContactScope,
  jobScope,
} from "@/lib/permissions";

/**
 * ⌘K live search — one query fanned across the records people actually hunt
 * for (clients, jobs, quotes, invoices), scoped exactly like the list pages.
 * Numeric queries also match record numbers ("1042" finds Invoice #1042).
 * Capped small on purpose: the palette is a jump menu, not a report.
 */
const TAKE = 5;

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const companyId = actor.companyId;
  const contains = { contains: q, mode: "insensitive" as const };
  const num = /^\d+$/.test(q) ? parseInt(q, 10) : null;
  const nameOr = [
    { firstName: contains },
    { lastName: contains },
    { companyName: contains },
  ];

  const [contacts, jobs, quotes, invoices] = await Promise.all([
    canSell(actor.role)
      ? prisma.contact.findMany({
          where: {
            companyId,
            ...contactScope(actor),
            OR: [...nameOr, { email: contains }, { phone: contains }, { address: contains }],
          },
          select: { id: true, firstName: true, lastName: true, companyName: true, address: true },
          orderBy: { updatedAt: "desc" },
          take: TAKE,
        })
      : Promise.resolve([]),
    prisma.job.findMany({
      where: {
        companyId,
        ...jobScope(actor),
        OR: [
          { title: contains },
          { address: contains },
          { contact: { OR: nameOr } },
          ...(num !== null ? [{ jobNumber: num }] : []),
        ],
      },
      select: {
        id: true,
        title: true,
        jobNumber: true,
        contact: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: TAKE,
    }),
    canSell(actor.role)
      ? prisma.quote.findMany({
          where: {
            companyId,
            ...viaContactScope(actor),
            OR: [
              { title: contains },
              { contact: { OR: nameOr } },
              ...(num !== null ? [{ quoteNumber: num }] : []),
            ],
          },
          select: {
            id: true,
            title: true,
            quoteNumber: true,
            contact: { select: { firstName: true, lastName: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: TAKE,
        })
      : Promise.resolve([]),
    canSeeMoney(actor)
      ? prisma.invoice.findMany({
          where: {
            companyId,
            ...viaContactScope(actor),
            OR: [
              { subject: contains },
              { contact: { OR: nameOr } },
              ...(num !== null ? [{ invoiceNumber: num }] : []),
            ],
          },
          select: {
            id: true,
            subject: true,
            invoiceNumber: true,
            status: true,
            contact: { select: { firstName: true, lastName: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: TAKE,
        })
      : Promise.resolve([]),
  ]);

  const person = (c: { firstName: string; lastName: string } | null | undefined) =>
    c ? `${c.firstName} ${c.lastName}`.trim() : "";

  const results = [
    ...contacts.map((c) => ({
      href: `/app/contacts/${c.id}`,
      label: person(c) || c.companyName || "Client",
      sub: c.companyName && person(c) ? c.companyName : (c.address ?? ""),
      group: "Clients",
    })),
    ...jobs.map((j) => ({
      href: `/app/jobs/${j.id}`,
      label: j.title || `Job #${j.jobNumber}`,
      sub: `#${j.jobNumber} · ${person(j.contact)}`,
      group: "Jobs",
    })),
    ...quotes.map((qt) => ({
      href: `/app/quotes/${qt.id}`,
      label: qt.title || `Quote #${qt.quoteNumber}`,
      sub: `#${qt.quoteNumber} · ${person(qt.contact)}`,
      group: "Quotes",
    })),
    ...invoices.map((inv) => ({
      href: `/app/invoices/${inv.id}`,
      label: inv.subject || `Invoice #${inv.invoiceNumber}`,
      sub: `#${inv.invoiceNumber} · ${person(inv.contact)}`,
      group: "Invoices",
    })),
  ];

  return NextResponse.json({ results });
}
