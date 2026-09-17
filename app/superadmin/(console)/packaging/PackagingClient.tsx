"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Copy,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

/**
 * The packaging board. Columns are what we sell (a tier, an add-on, or the
 * "Unassigned" backlog); cards are what WorkBench does. Dragging a card into
 * a column is the decision — nothing here enforces an entitlement, it's the
 * map the /pricing page gets built from.
 *
 * Drags commit optimistically: local state moves the card, then the whole
 * order of both affected columns goes to the server, so a dropped connection
 * can never leave the board half-sorted.
 */

type Card = {
  id: string;
  title: string;
  body: string | null;
  group: string | null;
  icon: string | null;
  catalogKey: string | null;
  sort: number;
};

type Lane = {
  id: string;
  name: string;
  kind: "TIER" | "ADDON" | "BACKLOG";
  price: string | null;
  priceNote: string | null;
  blurb: string | null;
  accent: string | null;
  sort: number;
  cards: Card[];
};

const BLUE = "#0B57D8";
const ORANGE = "#F86A0A";

/** Catalog section → card tint, so a column reads as a mix at a glance. */
const GROUP_CHIP: Record<string, string> = {
  "Win the work": "bg-blue-50 text-[#0B57D8]",
  "Run the day": "bg-orange-50 text-[#F86A0A]",
  "Get paid": "bg-green-50 text-green-700",
  "Keep clients close": "bg-purple-50 text-purple-700",
  "Atlas AI": "bg-indigo-50 text-indigo-700",
  Mobile: "bg-sky-50 text-sky-700",
  "Office & admin": "bg-amber-50 text-amber-700",
  "Brand & comms": "bg-rose-50 text-rose-700",
  Platform: "bg-gray-100 text-gray-600",
};

function groupChip(group: string | null): string {
  if (!group) return "bg-gray-100 text-gray-500";
  return GROUP_CHIP[group] ?? "bg-gray-100 text-gray-600";
}

function laneAccent(lane: Lane): string {
  if (lane.accent) return lane.accent;
  if (lane.kind === "BACKLOG") return "#9CA3AF";
  return lane.kind === "ADDON" ? ORANGE : BLUE;
}

export default function PackagingClient({ initialLanes }: { initialLanes: Lane[] }) {
  const router = useRouter();
  const [lanes, setLanes] = useState<Lane[]>(initialLanes);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // dialogs
  const [laneForm, setLaneForm] = useState<Lane | "new" | null>(null);
  const [cardForm, setCardForm] = useState<Card | "new" | null>(null);

  // drag
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ laneId: string; index: number } | null>(null);

  // The server is the source of truth after any structural change (add,
  // delete, sync) — a router.refresh() hands down fresh lanes and this
  // adopts them. Drags don't refresh, so they never fight this.
  useEffect(() => setLanes(initialLanes), [initialLanes]);

  const placed = lanes.filter((l) => l.kind !== "BACKLOG").length;
  const unplaced = lanes.find((l) => l.kind === "BACKLOG")?.cards.length ?? 0;
  const total = lanes.reduce((n, l) => n + l.cards.length, 0);

  async function send(url: string, body?: unknown, method = "POST"): Promise<boolean> {
    setError("");
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return false;
      }
      return true;
    } catch {
      setError("Couldn't reach the server — nothing was saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  // ── drag and drop ──────────────────────────────────────────────────────────

  function applyDrop(cardId: string, toLaneId: string, toIndex: number) {
    const from = lanes.find((l) => l.cards.some((c) => c.id === cardId));
    if (!from) return;
    const card = from.cards.find((c) => c.id === cardId)!;

    const next = lanes.map((lane) => ({ ...lane, cards: lane.cards.filter((c) => c.id !== cardId) }));
    const target = next.find((l) => l.id === toLaneId);
    if (!target) return;

    // Dropping lower in the SAME column: the card's own removal shifts every
    // index below it up one, so the insert point moves with it.
    const sameLane = from.id === toLaneId;
    const originalIndex = from.cards.findIndex((c) => c.id === cardId);
    const index = sameLane && toIndex > originalIndex ? toIndex - 1 : toIndex;
    target.cards.splice(Math.max(0, Math.min(index, target.cards.length)), 0, card);

    setLanes(next);

    const touched = sameLane ? [target] : [target, next.find((l) => l.id === from.id)!];
    void send("/api/superadmin/packaging/cards/reorder", {
      lanes: touched.map((l) => ({ laneId: l.id, cardIds: l.cards.map((c) => c.id) })),
    });
  }

  function cardDragProps(card: Card) {
    return {
      draggable: true,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        setDragId(card.id);
      },
      onDragEnd: () => {
        setDragId(null);
        setDrop(null);
      },
    };
  }

  /** Over a card: above its midpoint inserts before it, below inserts after. */
  function cardHoverProps(laneId: string, index: number) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dragId) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
        const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const after = e.clientY > box.top + box.height / 2;
        const at = after ? index + 1 : index;
        if (drop?.laneId !== laneId || drop?.index !== at) setDrop({ laneId, index: at });
      },
    };
  }

  function laneDropProps(lane: Lane) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        // Empty space below the cards = append to the end.
        if (drop?.laneId !== lane.id) setDrop({ laneId: lane.id, index: lane.cards.length });
      },
      onDragLeave: (e: React.DragEvent) => {
        if ((e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) return;
        if (drop?.laneId === lane.id) setDrop(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = dragId ?? e.dataTransfer.getData("text/plain");
        const at = drop?.laneId === lane.id ? drop.index : lane.cards.length;
        setDragId(null);
        setDrop(null);
        if (id) applyDrop(id, lane.id, at);
      },
    };
  }

  // ── actions ────────────────────────────────────────────────────────────────

  async function moveLane(lane: Lane, direction: "left" | "right") {
    if (await send(`/api/superadmin/packaging/lanes/${lane.id}`, { direction }, "PATCH")) {
      router.refresh();
    }
  }

  async function deleteLane(lane: Lane) {
    const n = lane.cards.length;
    const warning = n
      ? `Delete "${lane.name}"? Its ${n} feature${n === 1 ? "" : "s"} go back to Unassigned.`
      : `Delete "${lane.name}"?`;
    if (!confirm(warning)) return;
    if (await send(`/api/superadmin/packaging/lanes/${lane.id}`, undefined, "DELETE")) {
      router.refresh();
    }
  }

  async function deleteCard(card: Card) {
    const warning = card.catalogKey
      ? `Remove "${card.title}" from the board? It's a real WorkBench feature, so it comes back in Unassigned next time the catalog syncs — leave it in Unassigned instead if it's just undecided.`
      : `Delete "${card.title}"?`;
    if (!confirm(warning)) return;
    if (await send(`/api/superadmin/packaging/cards/${card.id}`, undefined, "DELETE")) {
      setCardForm(null);
      router.refresh();
    }
  }

  async function syncCatalog() {
    if (await send("/api/superadmin/packaging/sync")) router.refresh();
  }

  async function copyPlan() {
    setError("");
    try {
      const res = await fetch("/api/superadmin/packaging/export");
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy — open /api/superadmin/packaging/export and copy from there.");
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Packaging</h1>
          <p className="mt-1 text-[14px] text-gray-500">
            Drag every feature into what it's sold as. {total} feature
            {total === 1 ? "" : "s"} across {placed} plan{placed === 1 ? "" : "s"}
            {unplaced > 0 ? `, ${unplaced} still unassigned` : " — nothing left unassigned"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={copyPlan}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-[13px] font-bold text-gray-700 transition-colors hover:border-gray-900"
          >
            {copied ? (
              <ClipboardCheck className="h-4 w-4 text-green-600" strokeWidth={2.2} />
            ) : (
              <Copy className="h-4 w-4" strokeWidth={2.2} />
            )}
            {copied ? "Copied" : "Copy the plan"}
          </button>
          <button
            onClick={syncCatalog}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-[13px] font-bold text-gray-700 transition-colors hover:border-gray-900 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" strokeWidth={2.2} />
            Sync catalog
          </button>
          <button
            onClick={() => setCardForm("new")}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-gray-300 bg-white px-3 py-2 text-[13px] font-bold text-gray-700 transition-colors hover:border-gray-900"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Feature
          </button>
          <button
            onClick={() => setLaneForm("new")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B57D8] px-3 py-2 text-[13px] font-bold text-white transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            Plan or add-on
          </button>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">
          {error}
        </p>
      )}

      {/* The board scrolls sideways; columns keep a fixed width so a long
          plan never squeezes the others into slivers. */}
      <div className="-mx-5 mt-6 overflow-x-auto px-5 pb-4 sm:-mx-8 sm:px-8">
        <div className="flex min-h-[60vh] items-start gap-4">
          {lanes.map((lane, i) => {
            const accent = laneAccent(lane);
            const isDropTarget = drop?.laneId === lane.id && !!dragId;
            return (
              <section
                key={lane.id}
                {...laneDropProps(lane)}
                className={`flex w-[300px] flex-none flex-col rounded-2xl border bg-white transition-colors ${
                  isDropTarget ? "border-[#0B57D8] bg-blue-50/40" : "border-gray-200"
                }`}
              >
                <div className="rounded-t-2xl px-4 pb-3 pt-3.5" style={{ borderTop: `3px solid ${accent}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-[15px] font-extrabold text-gray-900">
                          {lane.name}
                        </h2>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-bold text-gray-500">
                          {lane.cards.length}
                        </span>
                      </div>
                      {lane.kind !== "BACKLOG" && (
                        <p className="mt-0.5 flex items-baseline gap-1.5">
                          <span className="text-[19px] font-extrabold leading-none" style={{ color: accent }}>
                            {lane.price || "—"}
                          </span>
                          {lane.priceNote && (
                            <span className="text-[11.5px] font-semibold text-gray-400">
                              {lane.priceNote}
                            </span>
                          )}
                        </p>
                      )}
                      {lane.blurb && (
                        <p className="mt-1.5 text-[12px] leading-snug text-gray-500">{lane.blurb}</p>
                      )}
                    </div>
                    {lane.kind !== "BACKLOG" && (
                      <div className="flex flex-none items-center gap-0.5">
                        <button
                          onClick={() => moveLane(lane, "left")}
                          aria-label={`Move ${lane.name} left`}
                          className="rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          <ChevronLeft className="h-4 w-4" strokeWidth={2.4} />
                        </button>
                        <button
                          onClick={() => moveLane(lane, "right")}
                          aria-label={`Move ${lane.name} right`}
                          className="rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
                        </button>
                        <button
                          onClick={() => setLaneForm(lane)}
                          aria-label={`Edit ${lane.name}`}
                          className="rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          <Pencil className="h-[15px] w-[15px]" strokeWidth={2.2} />
                        </button>
                      </div>
                    )}
                  </div>
                  {lane.kind === "ADDON" && (
                    <span className="mt-2 inline-block rounded-full bg-orange-50 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#F86A0A]">
                      Add-on
                    </span>
                  )}
                </div>

                <div className="flex flex-1 flex-col gap-2 px-3 pb-3">
                  {lane.cards.map((card, index) => (
                    <div key={card.id} {...cardHoverProps(lane.id, index)}>
                      {isDropTarget && drop?.index === index && <DropLine />}
                      <article
                        {...cardDragProps(card)}
                        onClick={() => setCardForm(card)}
                        className={`group cursor-grab rounded-xl border border-gray-200 bg-white p-2.5 transition-shadow hover:shadow-sm active:cursor-grabbing ${
                          dragId === card.id ? "opacity-40" : ""
                        }`}
                      >
                        <div className="flex items-start gap-1.5">
                          <GripVertical
                            className="mt-0.5 h-3.5 w-3.5 flex-none text-gray-300 group-hover:text-gray-400"
                            strokeWidth={2}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold leading-tight text-gray-900">
                              {card.title}
                            </p>
                            {card.body && (
                              <p className="mt-1 line-clamp-2 text-[11.5px] leading-snug text-gray-500">
                                {card.body}
                              </p>
                            )}
                            {card.group && (
                              <span
                                className={`mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${groupChip(card.group)}`}
                              >
                                {card.group}
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    </div>
                  ))}
                  {isDropTarget && drop && drop.index >= lane.cards.length && <DropLine />}
                  {lane.cards.length === 0 && !isDropTarget && (
                    <p className="rounded-xl border border-dashed border-gray-200 px-3 py-6 text-center text-[12px] font-semibold text-gray-300">
                      Drag features here
                    </p>
                  )}
                </div>

                {lane.kind !== "BACKLOG" && (
                  <div className="border-t border-gray-100 px-3 py-2">
                    <button
                      onClick={() => deleteLane(lane)}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11.5px] font-bold text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                      Delete column
                    </button>
                  </div>
                )}
                {i === 0 && lane.kind === "BACKLOG" && (
                  <div className="border-t border-gray-100 px-3 py-2">
                    <p className="text-[11px] leading-snug text-gray-400">
                      Everything WorkBench does. Leave a card here while it's undecided.
                    </p>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {laneForm && (
        <LaneDialog
          lane={laneForm === "new" ? null : laneForm}
          busy={busy}
          onClose={() => setLaneForm(null)}
          onSave={async (payload) => {
            const ok =
              laneForm === "new"
                ? await send("/api/superadmin/packaging/lanes", payload)
                : await send(`/api/superadmin/packaging/lanes/${laneForm.id}`, payload, "PATCH");
            if (ok) {
              setLaneForm(null);
              router.refresh();
            }
          }}
        />
      )}

      {cardForm && (
        <CardDialog
          card={cardForm === "new" ? null : cardForm}
          lanes={lanes}
          busy={busy}
          onClose={() => setCardForm(null)}
          onDelete={cardForm === "new" ? undefined : () => deleteCard(cardForm)}
          onSave={async (payload) => {
            const ok =
              cardForm === "new"
                ? await send("/api/superadmin/packaging/cards", payload)
                : await send(`/api/superadmin/packaging/cards/${cardForm.id}`, payload, "PATCH");
            if (ok) {
              setCardForm(null);
              router.refresh();
            }
          }}
        />
      )}
    </div>
  );
}

/** Where the card lands if it's dropped right now. */
function DropLine() {
  return <div className="my-1 h-[3px] rounded-full bg-[#0B57D8]" />;
}

// ─── dialogs ─────────────────────────────────────────────────────────────────

function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-extrabold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" strokeWidth={2.4} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const FIELD =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-[14px] text-gray-900 outline-none focus:border-[#0B57D8]";
const LABEL = "block text-[12px] font-bold uppercase tracking-wide text-gray-400";

function LaneDialog({
  lane,
  busy,
  onClose,
  onSave,
}: {
  lane: Lane | null;
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, string>) => void;
}) {
  const [name, setName] = useState(lane?.name ?? "");
  const [kind, setKind] = useState<"TIER" | "ADDON">(lane?.kind === "ADDON" ? "ADDON" : "TIER");
  const [price, setPrice] = useState(lane?.price ?? "");
  const [priceNote, setPriceNote] = useState(lane?.priceNote ?? "");
  const [blurb, setBlurb] = useState(lane?.blurb ?? "");
  const [accent, setAccent] = useState(lane?.accent ?? BLUE);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);

  return (
    <Dialog title={lane ? `Edit ${lane.name}` : "New plan or add-on"} onClose={onClose}>
      <form
        className="mt-4 flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ name, kind, price, priceNote, blurb, accent });
        }}
      >
        <label>
          <span className={LABEL}>Name</span>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workbench Pro"
            className={FIELD}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={LABEL}>Kind</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "TIER" | "ADDON")}
              className={FIELD}
            >
              <option value="TIER">Subscription tier</option>
              <option value="ADDON">Add-on</option>
            </select>
          </label>
          <label>
            <span className={LABEL}>Accent</span>
            <input
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="mt-1 h-[42px] w-full rounded-lg border border-gray-300 bg-white px-1"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={LABEL}>Price</span>
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="$49"
              className={FIELD}
            />
          </label>
          <label>
            <span className={LABEL}>Price note</span>
            <input
              value={priceNote}
              onChange={(e) => setPriceNote(e.target.value)}
              placeholder="per month"
              className={FIELD}
            />
          </label>
        </div>
        <label>
          <span className={LABEL}>One-line pitch</span>
          <input
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="For companies running more than one crew."
            className={FIELD}
          />
        </label>
        <p className="text-[12px] leading-snug text-gray-400">
          Price is free text on purpose — &ldquo;$0&rdquo;, &ldquo;$29/mo&rdquo;, &ldquo;2.9% +
          30¢&rdquo;, or &ldquo;TBD&rdquo; all work while this is still being decided.
        </p>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B57D8] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {lane ? "Save" : "Add column"}
        </button>
      </form>
    </Dialog>
  );
}

function CardDialog({
  card,
  lanes,
  busy,
  onClose,
  onSave,
  onDelete,
}: {
  card: Card | null;
  lanes: Lane[];
  busy: boolean;
  onClose: () => void;
  onSave: (payload: Record<string, string>) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(card?.title ?? "");
  const [body, setBody] = useState(card?.body ?? "");
  const [group, setGroup] = useState(card?.group ?? "");
  // On an existing card this is the touch-friendly alternative to dragging;
  // on a new one it's where the card starts.
  const [laneId, setLaneId] = useState(
    card
      ? lanes.find((l) => l.cards.some((c) => c.id === card.id))?.id ?? ""
      : lanes.find((l) => l.kind === "BACKLOG")?.id ?? lanes[0]?.id ?? ""
  );
  const titleRef = useRef<HTMLInputElement>(null);
  useEffect(() => titleRef.current?.focus(), []);

  return (
    <Dialog title={card ? "Edit feature" : "New feature"} onClose={onClose}>
      <form
        className="mt-4 flex flex-col gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ title, body, group, laneId });
        }}
      >
        <label>
          <span className={LABEL}>Feature</span>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Priority onboarding call"
            className={FIELD}
          />
        </label>
        <label>
          <span className={LABEL}>What it is</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="A 45-minute setup session with a real person, scheduled in the first week."
            className={`${FIELD} resize-none`}
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className={LABEL}>Group</span>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="Platform"
              className={FIELD}
            />
          </label>
          <label>
            <span className={LABEL}>{card ? "Sold in" : "Starts in"}</span>
            <select value={laneId} onChange={(e) => setLaneId(e.target.value)} className={FIELD}>
              {lanes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {card?.catalogKey && (
          <p className="text-[12px] leading-snug text-gray-400">
            From the feature catalog. Rewording it here only changes the board and the pricing
            page it feeds — <span className="font-semibold">/features</span> keeps its own copy.
          </p>
        )}
        <div className="mt-1 flex items-center gap-2">
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#0B57D8] px-4 py-2.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {card ? "Save" : "Add feature"}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label="Delete feature"
              className="rounded-lg border-2 border-gray-200 p-2.5 text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
