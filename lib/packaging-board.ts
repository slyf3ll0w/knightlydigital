import { prisma } from "@/lib/db";
import { catalogFeatures, STARTER_LANES } from "@/lib/packaging-catalog";

/**
 * The packaging board's server side: load it, seed it the first time, and
 * keep it in step with the feature catalog.
 *
 * Nothing here gates a real entitlement — this is the planning surface where
 * the free/paid split gets decided by dragging cards. `boardToMarkdown()` is
 * the read-back: the shape the /pricing page gets designed from once the
 * board settles (also what scripts/read-packaging-board.mjs prints).
 */

export type BoardCard = {
  id: string;
  title: string;
  body: string | null;
  group: string | null;
  icon: string | null;
  catalogKey: string | null;
  sort: number;
};

export type BoardLane = {
  id: string;
  name: string;
  kind: "TIER" | "ADDON" | "BACKLOG";
  price: string | null;
  priceNote: string | null;
  blurb: string | null;
  accent: string | null;
  sort: number;
  cards: BoardCard[];
};

/** Seed the starter lanes + every catalog feature the first time through. */
async function seedIfEmpty(): Promise<void> {
  const existing = await prisma.packagingLane.count();
  if (existing > 0) return;
  for (const [i, lane] of STARTER_LANES.entries()) {
    await prisma.packagingLane.create({ data: { ...lane, sort: i } });
  }
}

/**
 * Add catalog features that aren't on the board yet, into the backlog.
 * Additive and keyed on catalogKey — a card already dragged into a tier is
 * left exactly where it is, with whatever wording it has. Returns how many
 * were added.
 */
export async function syncCatalog(): Promise<number> {
  await seedIfEmpty();
  const backlog = await backlogLane();
  const known = new Set(
    (
      await prisma.packagingCard.findMany({
        where: { catalogKey: { not: null } },
        select: { catalogKey: true },
      })
    ).map((c) => c.catalogKey as string)
  );

  const missing = catalogFeatures().filter((f) => !known.has(f.key));
  if (missing.length === 0) return 0;

  const top = await prisma.packagingCard.aggregate({
    where: { laneId: backlog.id },
    _max: { sort: true },
  });
  let sort = (top._max.sort ?? -1) + 1;

  await prisma.packagingCard.createMany({
    data: missing.map((f) => ({
      laneId: backlog.id,
      title: f.title,
      body: f.body,
      group: f.group,
      icon: f.icon,
      catalogKey: f.key,
      sort: sort++,
    })),
  });
  return missing.length;
}

/** The backlog lane — created if a board somehow lost it. */
export async function backlogLane(): Promise<{ id: string }> {
  const found = await prisma.packagingLane.findFirst({
    where: { kind: "BACKLOG" },
    orderBy: { sort: "asc" },
    select: { id: true },
  });
  if (found) return found;
  return prisma.packagingLane.create({
    data: { name: "Unassigned", kind: "BACKLOG", sort: -1 },
    select: { id: true },
  });
}

/** The whole board, lanes in order, cards in order. Seeds on first call. */
export async function loadBoard(): Promise<BoardLane[]> {
  await seedIfEmpty();
  const lanes = await prisma.packagingLane.findMany({
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    include: { cards: { orderBy: [{ sort: "asc" }, { createdAt: "asc" }] } },
  });
  return lanes.map((l) => ({
    id: l.id,
    name: l.name,
    kind: l.kind,
    price: l.price,
    priceNote: l.priceNote,
    blurb: l.blurb,
    accent: l.accent,
    sort: l.sort,
    cards: l.cards.map((c) => ({
      id: c.id,
      title: c.title,
      body: c.body,
      group: c.group,
      icon: c.icon,
      catalogKey: c.catalogKey,
      sort: c.sort,
    })),
  }));
}

/**
 * The board as a briefing document — the hand-off from "I've finished
 * dragging" to "build the pricing page from this."
 */
export function boardToMarkdown(lanes: BoardLane[]): string {
  const out: string[] = ["# WorkBench packaging plan", ""];
  const placed = lanes.filter((l) => l.kind !== "BACKLOG");
  const backlog = lanes.filter((l) => l.kind === "BACKLOG");

  for (const lane of placed) {
    const price = [lane.price, lane.priceNote].filter(Boolean).join(" — ");
    out.push(`## ${lane.name} (${lane.kind === "ADDON" ? "add-on" : "tier"})`);
    if (price) out.push(`**Price:** ${price}`);
    if (lane.blurb) out.push(`**Pitch:** ${lane.blurb}`);
    if (lane.accent) out.push(`**Accent:** ${lane.accent}`);
    out.push("");
    if (lane.cards.length === 0) {
      out.push("_No features assigned yet._", "");
      continue;
    }
    for (const card of lane.cards) {
      out.push(`- **${card.title}**${card.group ? ` _(${card.group})_` : ""}`);
      if (card.body) out.push(`  ${card.body}`);
    }
    out.push("");
  }

  for (const lane of backlog) {
    out.push(`## ${lane.name} — not yet placed (${lane.cards.length})`);
    out.push("");
    for (const card of lane.cards) out.push(`- ${card.title}`);
    out.push("");
  }

  return out.join("\n").trimEnd() + "\n";
}
