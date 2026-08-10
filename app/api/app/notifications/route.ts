import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, canSeeMoney, contactScope, viaContactScope } from "@/lib/permissions";

/**
 * Recent-activity feed for the mobile header bell: the same events the push
 * notifications announce (new requests, online bookings, payments, past-due
 * invoices, new leads), aggregated on demand — no notification table, so the
 * feed can never drift from the real records. Role-scoped exactly like the
 * list pages; SALES/USER see only their assigned contacts' events.
 */

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type ContactBits = { firstName: string; lastName: string; companyName: string | null } | null;

function who(c: ContactBits): string {
  if (!c) return "";
  const company = c.companyName?.trim();
  if (company) return company;
  return `${c.firstName} ${c.lastName}`.trim();
}

function money(n: unknown): string {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const scope = viaContactScope(actor);
  const since = new Date(Date.now() - WINDOW_MS);
  const sell = canSell(actor.role);
  const seeMoney = canSeeMoney(actor);

  const [requests, leads, bookings, payments, pastDue, clientMessages] = await Promise.all([
    sell
      ? prisma.request.findMany({
          where: { companyId: actor.companyId, status: "NEW", createdAt: { gte: since }, ...scope },
          orderBy: { createdAt: "desc" },
          take: 6,
          select: {
            id: true,
            title: true,
            createdAt: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        })
      : Promise.resolve([]),
    sell
      ? prisma.contact.findMany({
          where: {
            companyId: actor.companyId,
            ...contactScope(actor),
            status: "LEAD",
            createdAt: { gte: since },
          },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            companyName: true,
            leadSource: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    // Self-scheduled bookings awaiting approval — the schedule renders these
    // dashed; they're the most actionable thing in the feed.
    sell
      ? prisma.appointment.findMany({
          where: { companyId: actor.companyId, ...scope, tentative: true, createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            title: true,
            createdAt: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        })
      : Promise.resolve([]),
    seeMoney
      ? prisma.payment.findMany({
          where: { companyId: actor.companyId, ...scope, paidAt: { gte: since } },
          orderBy: { paidAt: "desc" },
          take: 6,
          select: {
            id: true,
            amount: true,
            paidAt: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        })
      : Promise.resolve([]),
    seeMoney
      ? prisma.invoice.findMany({
          where: {
            companyId: actor.companyId,
            ...scope,
            OR: [
              { status: "PAST_DUE" },
              { status: "AWAITING_PAYMENT", dueDate: { lt: new Date() } },
            ],
          },
          orderBy: { dueDate: "asc" },
          take: 5,
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
            dueDate: true,
            contact: { select: { firstName: true, lastName: true, companyName: true } },
          },
        })
      : Promise.resolve([]),
    // Unread client messages (portal or SMS) — previously push-only, so a
    // missed push meant the message vanished until someone opened the inbox.
    prisma.portalMessage.findMany({
      where: {
        companyId: actor.companyId,
        direction: "INBOUND",
        readByTeamAt: null,
        createdAt: { gte: since },
        contact: { is: { ...(contactScope(actor) as object) } },
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        body: true,
        createdAt: true,
        contactId: true,
        contact: { select: { firstName: true, lastName: true, companyName: true } },
      },
    }),
  ]);

  const items = [
    ...requests.map((r) => ({
      id: `req-${r.id}`,
      kind: "request" as const,
      title: "New request",
      sub: [r.title, who(r.contact)].filter(Boolean).join(" · "),
      at: r.createdAt.toISOString(),
      href: `/app/requests/${r.id}`,
    })),
    ...leads.map((l) => ({
      id: `lead-${l.id}`,
      kind: "lead" as const,
      title: "New lead",
      sub: [who(l), l.leadSource?.trim()].filter(Boolean).join(" · "),
      at: l.createdAt.toISOString(),
      href: "/app/leads",
    })),
    ...bookings.map((b) => ({
      id: `appt-${b.id}`,
      kind: "booking" as const,
      title: "Booking to approve",
      sub: [b.title, who(b.contact)].filter(Boolean).join(" · "),
      at: b.createdAt.toISOString(),
      href: "/app/schedule",
    })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      kind: "payment" as const,
      title: `Payment received · ${money(p.amount)}`,
      sub: who(p.contact),
      at: p.paidAt.toISOString(),
      href: "/app/payments",
    })),
    ...pastDue.map((inv) => ({
      id: `inv-${inv.id}`,
      kind: "invoice" as const,
      title: `Invoice #${inv.invoiceNumber} past due`,
      sub: [money(inv.total), who(inv.contact)].filter(Boolean).join(" · "),
      at: (inv.dueDate ?? new Date()).toISOString(),
      href: `/app/invoices/${inv.id}`,
    })),
    ...clientMessages.map((m) => ({
      id: `msg-${m.id}`,
      kind: "message" as const,
      title: `Message from ${who(m.contact) || "a client"}`,
      sub: m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body,
      at: m.createdAt.toISOString(),
      href: `/app/messages/thread/${m.contactId}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);

  return NextResponse.json({ items });
}
