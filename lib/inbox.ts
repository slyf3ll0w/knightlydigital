import { prisma } from "@/lib/db";
import { viaContactScope, type Actor } from "@/lib/permissions";

/**
 * The Messages inbox rows: one per conversation (contact), newest activity
 * first, with the count of client messages the team hasn't opened. Shared by
 * the page's first paint and `GET /api/app/messages/inbox`, which the page
 * polls so the list updates in place instead of re-rendering the route.
 *
 * Latest-per-contact is a GROUP BY on the database (`[contactId,
 * createdAt]` index) — Prisma's `distinct` without the nativeDistinct
 * preview loads every message of the company and de-duplicates in memory,
 * which grew with every text (2026-09-29).
 */
export type InboxRow = {
  contactId: string;
  name: string;
  companyName: string | null;
  /** "You: …" / "Maria: …" for the team's own messages, the body for the client's. */
  preview: string;
  /** ISO — when the conversation last moved. */
  at: string;
  unread: number;
};

const LIMIT = 100;

export async function loadInbox(actor: Actor): Promise<InboxRow[]> {
  const scope = { companyId: actor.companyId, ...viaContactScope(actor) };
  const [latest, unread] = await Promise.all([
    prisma.portalMessage.groupBy({
      by: ["contactId"],
      where: scope,
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: LIMIT,
    }),
    prisma.portalMessage.groupBy({
      by: ["contactId"],
      where: { ...scope, direction: "INBOUND", readByTeamAt: null },
      _count: { _all: true },
    }),
  ]);
  if (latest.length === 0) return [];

  const rows = await prisma.portalMessage.findMany({
    where: {
      companyId: actor.companyId,
      OR: latest.map((g) => ({ contactId: g.contactId, createdAt: g._max.createdAt ?? undefined })),
    },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: { id: true, firstName: true, lastName: true, companyName: true } },
      sender: { select: { name: true } },
    },
  });
  const unreadByContact = new Map(unread.map((u) => [u.contactId, u._count._all]));

  const out: InboxRow[] = [];
  const seen = new Set<string>();
  for (const m of rows) {
    if (seen.has(m.contactId)) continue; // two rows on the same instant — keep the first
    seen.add(m.contactId);
    out.push({
      contactId: m.contactId,
      name: `${m.contact.firstName} ${m.contact.lastName}`.trim(),
      companyName: m.contact.companyName,
      preview:
        m.direction === "OUTBOUND"
          ? `${m.sender?.name ? m.sender.name.split(" ")[0] : "You"}: ${m.body}`
          : m.body,
      at: m.createdAt.toISOString(),
      unread: unreadByContact.get(m.contactId) ?? 0,
    });
  }
  return out;
}
