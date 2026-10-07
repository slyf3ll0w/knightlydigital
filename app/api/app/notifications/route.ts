import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getActor, canSell, canSeeMoney, contactScope, viaContactScope } from "@/lib/permissions";
import { pastDueFilter } from "@/lib/due-dates";

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

/** The bell icon for a recorded push, from where its tap lands. */
function kindForUrl(url: string): "request" | "lead" | "booking" | "payment" | "invoice" | "quote" | "message" | "call" | "task" | "automation" {
  if (url.startsWith("/app/leads")) return "lead";
  if (url.startsWith("/app/requests")) return "request";
  if (url.startsWith("/app/quotes")) return "quote";
  if (url.startsWith("/app/invoices")) return "invoice";
  if (url.startsWith("/app/payments")) return "payment";
  if (url.startsWith("/app/schedule") || url.startsWith("/app/appointments") || url.startsWith("/app/jobs")) return "booking";
  if (url.startsWith("/app/calls")) return "call";
  if (url.startsWith("/app/tasks")) return "task";
  if (url.startsWith("/app/messages") || url.startsWith("/app/chat")) return "message";
  return "automation";
}

/**
 * The record a link names, as `kind:id` — the key both halves of the feed
 * dedupe on, so a push that lands on the invoice and the live payment row
 * that lands on the same invoice count as one thing (2026-10-07). Lead
 * pushes carry `?lead=<contactId>` for this; older ones without it have no
 * entity and fall back to the exact-href rule.
 */
function entityOf(url: string): string | null {
  const [path, query = ""] = url.split("?");
  let m = path.match(/^\/app\/requests\/([^/]+)$/);
  if (m) return `request:${m[1]}`;
  m = path.match(/^\/app\/messages\/thread\/([^/]+)$/);
  if (m) return `thread:${m[1]}`;
  m = path.match(/^\/app\/appointments\/([^/]+)$/);
  if (m) return `appointment:${m[1]}`;
  m = path.match(/^\/app\/invoices\/([^/]+)$/);
  if (m) return `invoice:${m[1]}`;
  if (path === "/app/leads") {
    const lead = new URLSearchParams(query).get("lead");
    if (lead) return `lead:${lead}`;
  }
  return null;
}

/** The ids of one entity kind across a list of recorded notices. */
function idsOf(entities: (string | null)[], kind: string): string[] {
  const prefix = `${kind}:`;
  return [...new Set(entities.filter((e): e is string => Boolean(e && e.startsWith(prefix))).map((e) => e.slice(prefix.length)))];
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

  // The board's first column — a lead still sitting there is "new"; used by
  // the live lead rows and by the handled check on recorded lead notices.
  const firstStage = await prisma.pipelineStage.findFirst({
    where: { companyId: actor.companyId, isConverted: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });
  const firstStageId = firstStage?.id ?? null;

  const [requests, leads, bookings, payments, pastDue, clientMessages, notices] = await Promise.all([
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
    // New leads: only ones that came in on their own (not typed in by the
    // team) and are still untouched in the board's first column — moving the
    // card, or the lead converting, takes it out of the bell at once.
    sell
      ? prisma.contact.findMany({
          where: {
            companyId: actor.companyId,
            ...contactScope(actor),
            status: "LEAD",
            createdById: null,
            createdAt: { gte: since },
            pipelineStageId: firstStageId,
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
            requestId: true,
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
            invoiceId: true,
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
              { status: "AWAITING_PAYMENT", dueDate: pastDueFilter() },
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
    prisma.automationNotice.findMany({
      where: { companyId: actor.companyId, userId: actor.id, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, title: true, body: true, url: true, createdAt: true, automationId: true },
    }),
  ]);

  // Live rows link where the matching push does (lib/payments.ts → the
  // invoice, lib/booking-submit.ts → the request or the appointment), so the
  // bell never shows one event as two rows with two destinations.
  const live = [
    ...requests.map((r) => ({
      id: `req-${r.id}`,
      kind: "request" as const,
      title: "New request",
      sub: [r.title, who(r.contact)].filter(Boolean).join(" · "),
      at: r.createdAt.toISOString(),
      href: `/app/requests/${r.id}`,
      entity: `request:${r.id}`,
    })),
    ...leads.map((l) => ({
      id: `lead-${l.id}`,
      kind: "lead" as const,
      title: "New lead",
      sub: [who(l), l.leadSource?.trim()].filter(Boolean).join(" · "),
      at: l.createdAt.toISOString(),
      href: "/app/leads",
      entity: `lead:${l.id}`,
    })),
    ...bookings.map((b) => ({
      id: `appt-${b.id}`,
      kind: "booking" as const,
      title: "Booking to approve",
      sub: [b.title, who(b.contact)].filter(Boolean).join(" · "),
      at: b.createdAt.toISOString(),
      href: b.requestId ? `/app/requests/${b.requestId}` : `/app/appointments/${b.id}`,
      entity: b.requestId ? `request:${b.requestId}` : `appointment:${b.id}`,
    })),
    ...payments.map((p) => ({
      id: `pay-${p.id}`,
      kind: "payment" as const,
      title: `Payment received · ${money(p.amount)}`,
      sub: who(p.contact),
      at: p.paidAt.toISOString(),
      href: `/app/invoices/${p.invoiceId}`,
      entity: `invoice:${p.invoiceId}`,
    })),
    ...pastDue.map((inv) => ({
      id: `inv-${inv.id}`,
      kind: "invoice" as const,
      title: `Invoice #${inv.invoiceNumber} past due`,
      sub: [money(inv.total), who(inv.contact)].filter(Boolean).join(" · "),
      at: (inv.dueDate ?? new Date()).toISOString(),
      href: `/app/invoices/${inv.id}`,
      entity: `invoice:${inv.id}`,
    })),
    ...clientMessages.map((m) => ({
      id: `msg-${m.id}`,
      kind: "message" as const,
      title: `Message from ${who(m.contact) || "a client"}`,
      sub: m.body.length > 90 ? `${m.body.slice(0, 90)}…` : m.body,
      at: m.createdAt.toISOString(),
      href: `/app/messages/thread/${m.contactId}`,
      entity: `thread:${m.contactId}`,
    })),
  ];
  // Every push is recorded as a notice (lib/push.ts notifyUsers), so the bell
  // keeps what a card said after it is gone. A notice about something the
  // feed already shows live (the request, the lead, the message) is dropped
  // — the record is the better row — and the kind follows the link so the
  // icon matches the record it points at.
  const liveHrefs = new Set(live.map((i) => i.href));
  const liveEntities = new Set(live.map((i) => i.entity));
  const pushes = notices.filter((n) => !n.automationId);
  const entities = new Map(pushes.map((n) => [n.id, entityOf(n.url)]));

  // Handled records stay hidden (2026-10-07): a push about a request, lead or
  // client message used to come back as "new" once its live row went away
  // (request answered, lead moved a column, text read) and sat there for 30
  // days. The same rules the live rows use decide "handled" here, so a
  // notice is gone for good once the thing it pointed at is dealt with.
  // Pushes about invoices and appointments are news, not to-dos, so they
  // stay until they age out; a link to a record that no longer exists is
  // dropped as well.
  const requestIds = idsOf([...entities.values()], "request");
  const leadIds = idsOf([...entities.values()], "lead");
  const threadIds = idsOf([...entities.values()], "thread");
  const apptIds = idsOf([...entities.values()], "appointment");
  const [openRequests, openLeads, unreadThreads, existingAppts] = await Promise.all([
    requestIds.length
      ? prisma.request.findMany({
          where: { id: { in: requestIds }, companyId: actor.companyId, status: { in: ["NEW", "NEEDS_APPROVAL"] } },
          select: { id: true },
        })
      : Promise.resolve([]),
    leadIds.length
      ? prisma.contact.findMany({
          where: { id: { in: leadIds }, companyId: actor.companyId, status: "LEAD", pipelineStageId: firstStageId },
          select: { id: true },
        })
      : Promise.resolve([]),
    threadIds.length
      ? prisma.portalMessage.findMany({
          where: { companyId: actor.companyId, contactId: { in: threadIds }, direction: "INBOUND", readByTeamAt: null },
          distinct: ["contactId"],
          select: { contactId: true },
        })
      : Promise.resolve([]),
    apptIds.length
      ? prisma.appointment.findMany({ where: { id: { in: apptIds }, companyId: actor.companyId }, select: { id: true } })
      : Promise.resolve([]),
  ]);
  const stillOpen = new Set<string>([
    ...openRequests.map((r) => `request:${r.id}`),
    ...openLeads.map((l) => `lead:${l.id}`),
    ...unreadThreads.map((m) => `thread:${m.contactId}`),
    ...existingAppts.map((a) => `appointment:${a.id}`),
  ]);
  const handled = (entity: string | null) =>
    Boolean(entity) && !entity!.startsWith("invoice:") && !stillOpen.has(entity as string);

  const notes = notices
    .filter((n) => {
      if (n.automationId) return true;
      const entity = entities.get(n.id) ?? null;
      if (liveHrefs.has(n.url) || (entity && liveEntities.has(entity))) return false;
      return !handled(entity);
    })
    .map((n) => ({
      id: `auto-${n.id}`,
      kind: n.automationId ? ("automation" as const) : kindForUrl(n.url),
      title: n.title,
      sub: n.body ?? "",
      at: n.createdAt.toISOString(),
      href: n.url.startsWith("/app/") ? n.url : "/app/automations",
    }));

  const items = [...notes, ...live.map(({ entity: _entity, ...row }) => row)]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 20);

  return NextResponse.json({ items });
}
