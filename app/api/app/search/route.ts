import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  getActor,
  canSell,
  canSeeMoney,
  contactScope,
  viaContactScope,
  jobScope,
  appointmentScope,
} from "@/lib/permissions";

/**
 * ⌘K live search — one query fanned across the records people actually hunt
 * for (clients, jobs, quotes, invoices, requests, appointments), scoped
 * exactly like the list pages. Numeric queries also match record numbers
 * ("1042" finds Invoice #1042). Capped small on purpose: the palette is a
 * jump menu, not a report.
 */
const TAKE = 5;

export async function GET(req: NextRequest) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  // `recent=1` with no query = the empty palette's "pick up where you left
  // off" list: the most recently touched records, same scoping, no filter.
  const recent = q.length < 2 && req.nextUrl.searchParams.get("recent") === "1";
  if (q.length < 2 && !recent) return NextResponse.json({ results: [] });

  const companyId = actor.companyId;
  const contains = { contains: q, mode: "insensitive" as const };
  const num = /^\d+$/.test(q) ? parseInt(q, 10) : null;
  const nameOr = [
    { firstName: contains },
    { lastName: contains },
    { companyName: contains },
  ];
  // In recent mode the OR filters collapse away — updatedAt ordering (already
  // on every query) does the work.
  const filtered = <T,>(or: T[]): { OR: T[] } | Record<string, never> =>
    recent ? {} : { OR: or };

  const [contacts, jobs, quotes, invoices, requests, appointments] = await Promise.all([
    canSell(actor.role)
      ? prisma.contact.findMany({
          where: {
            companyId,
            ...contactScope(actor),
            ...filtered([...nameOr, { email: contains }, { phone: contains }, { address: contains }]),
          },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            address: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: "desc" },
          take: recent ? 3 : TAKE,
        })
      : Promise.resolve([]),
    prisma.job.findMany({
      where: {
        companyId,
        ...jobScope(actor),
        ...filtered<object>([
          { title: contains },
          { address: contains },
          { contact: { OR: nameOr } },
          ...(num !== null ? [{ jobNumber: num }] : []),
        ]),
      },
      select: {
        id: true,
        title: true,
        jobNumber: true,
        updatedAt: true,
        contact: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: recent ? 3 : TAKE,
    }),
    canSell(actor.role)
      ? prisma.quote.findMany({
          where: {
            companyId,
            ...viaContactScope(actor),
            ...filtered<object>([
              { title: contains },
              { contact: { OR: nameOr } },
              ...(num !== null ? [{ quoteNumber: num }] : []),
            ]),
          },
          select: {
            id: true,
            title: true,
            quoteNumber: true,
            updatedAt: true,
            contact: { select: { firstName: true, lastName: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: recent ? 3 : TAKE,
        })
      : Promise.resolve([]),
    canSeeMoney(actor)
      ? prisma.invoice.findMany({
          where: {
            companyId,
            ...viaContactScope(actor),
            ...filtered<object>([
              { subject: contains },
              { contact: { OR: nameOr } },
              ...(num !== null ? [{ invoiceNumber: num }] : []),
            ]),
          },
          select: {
            id: true,
            subject: true,
            invoiceNumber: true,
            status: true,
            updatedAt: true,
            contact: { select: { firstName: true, lastName: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: recent ? 3 : TAKE,
        })
      : Promise.resolve([]),
    canSell(actor.role)
      ? prisma.request.findMany({
          where: {
            companyId,
            ...viaContactScope(actor),
            ...filtered<object>([
              { title: contains },
              { contact: { OR: nameOr } },
              ...(num !== null ? [{ requestNumber: num }] : []),
            ]),
          },
          select: {
            id: true,
            title: true,
            requestNumber: true,
            updatedAt: true,
            contact: { select: { firstName: true, lastName: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: recent ? 3 : TAKE,
        })
      : Promise.resolve([]),
    prisma.appointment.findMany({
      where: {
        companyId,
        ...appointmentScope(actor),
        ...filtered<object>([
          { title: contains },
          { contact: { OR: nameOr } },
          ...(num !== null ? [{ appointmentNumber: num }] : []),
        ]),
      },
      select: {
        id: true,
        title: true,
        appointmentNumber: true,
        updatedAt: true,
        contact: { select: { firstName: true, lastName: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: recent ? 3 : TAKE,
    }),
  ]);

  const person = (c: { firstName: string; lastName: string } | null | undefined) =>
    c ? `${c.firstName} ${c.lastName}`.trim() : "";

  const stamped = [
    ...contacts.map((c) => ({
      href: `/app/contacts/${c.id}`,
      label: person(c) || c.companyName || "Client",
      sub: c.companyName && person(c) ? c.companyName : (c.address ?? ""),
      group: "Clients",
      at: c.updatedAt,
    })),
    ...jobs.map((j) => ({
      href: `/app/jobs/${j.id}`,
      label: j.title || `Job #${j.jobNumber}`,
      sub: `#${j.jobNumber} · ${person(j.contact)}`,
      group: "Jobs",
      at: j.updatedAt,
    })),
    ...quotes.map((qt) => ({
      href: `/app/quotes/${qt.id}`,
      label: qt.title || `Quote #${qt.quoteNumber}`,
      sub: `#${qt.quoteNumber} · ${person(qt.contact)}`,
      group: "Quotes",
      at: qt.updatedAt,
    })),
    ...invoices.map((inv) => ({
      href: `/app/invoices/${inv.id}`,
      label: inv.subject || `Invoice #${inv.invoiceNumber}`,
      sub: `#${inv.invoiceNumber} · ${person(inv.contact)}`,
      group: "Invoices",
      at: inv.updatedAt,
    })),
    ...requests.map((r) => ({
      href: `/app/requests/${r.id}`,
      label: r.title || `Request #${r.requestNumber}`,
      sub: `#${r.requestNumber} · ${person(r.contact)}`,
      group: "Requests",
      at: r.updatedAt,
    })),
    ...appointments.map((a) => ({
      href: `/app/appointments/${a.id}`,
      label: a.title || `Appointment #${a.appointmentNumber}`,
      sub: `#${a.appointmentNumber} · ${person(a.contact)}`,
      group: "Appointments",
      at: a.updatedAt,
    })),
  ];
  // Recent mode interleaves the types by freshness; search keeps the
  // grouped order the palette has always shown.
  if (recent) stamped.sort((a, b) => b.at.getTime() - a.at.getTime());
  const results = (recent ? stamped.slice(0, 8) : stamped).map(({ at: _at, ...r }) => r);

  return NextResponse.json({ results });
}
