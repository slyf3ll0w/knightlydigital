"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  SquareKanban,
  Trash2,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import { Button, Chip, DsPage, InfoTip, PageHeader } from "@/components/ds";
import Modal from "@/components/Modal";
import { Input, Textarea } from "@/components/Input";
import { QuickMenu, type QuickAction } from "@/components/QuickMenu";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { showWinBurst } from "@/lib/win-burst";
import { themedInkVars, themedBgVars } from "@/lib/section-colors";
import { fullDate } from "@/lib/console-format";
import type { ConsoleLeadCard, ConsoleStage } from "@/lib/console-leads";

/**
 * The console's lead board — a copy of the tenant Leads board
 * (app/platform/leads/LeadsBoardClient.tsx) over ConsoleLead rows. Desktop:
 * drag cards between columns, onto the Won / Lost pills that appear while
 * dragging, right-click for the quick menu, click to open. Phones: the
 * columns swipe one at a time and a tap opens the card sheet (move, won,
 * lost, reply), the same as the app.
 */

type Undo = { stageId: string; status: string };
type Toast = { message: string; tone: "good" | "plain" | "bad"; undo?: { cardId: string; payload: Undo } };

function stageTint(hex: string | null, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  const n = m ? parseInt(m[1], 16) : 0x0c0f0c;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function daysIn(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? "today" : `${days}d`;
}

const sourceLabel = (s: string) => (s === "contact_form" ? "Contact form" : "Added");

export default function ConsoleLeadsBoard({
  stages,
  cards,
  lost,
}: {
  stages: ConsoleStage[];
  cards: ConsoleLeadCard[];
  lost: ConsoleLeadCard[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [board, setBoard] = useState(cards);
  useEffect(() => setBoard(cards), [cards]);

  const [query, setQuery] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<"won" | "lost" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lostCard, setLostCard] = useState<ConsoleLeadCard | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [menu, setMenu] = useState<{ card: ConsoleLeadCard; anchor: { x: number; y: number } } | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [customize, setCustomize] = useState(false);
  const [showLost, setShowLost] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const wonStage = stages.find((s) => s.isWon);
  const workStages = stages.filter((s) => !s.isWon);
  const openCard = board.find((c) => c.id === openId) ?? lost.find((c) => c.id === openId) ?? null;

  function showToast(t: Toast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }
  const refresh = () => startTransition(() => router.refresh());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return board;
    return board.filter((c) =>
      [c.name, c.businessName, c.email, c.phone, c.message, c.notes].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [board, query]);

  const byStage = useMemo(() => {
    const map = new Map<string, ConsoleLeadCard[]>(stages.map((s) => [s.id, []]));
    for (const c of visible) map.get(c.stageId)?.push(c);
    return map;
  }, [stages, visible]);

  // ── moves ────────────────────────────────────────────────────────────────

  async function moveCard(card: ConsoleLeadCard, stageId: string, burstAt?: { x: number; y: number }) {
    if (card.stageId === stageId && card.status !== "LOST") return;
    const prev = board;
    const toWon = stageId === wonStage?.id;
    setBoard((b) => [
      { ...card, stageId, status: toWon ? "WON" : "OPEN", stageChangedAt: new Date().toISOString() },
      ...b.filter((c) => c.id !== card.id),
    ]);
    const { ok, data } = await postJson<{ undo: Undo }>(`/api/superadmin/leads/${card.id}`, { stageId }, "PATCH");
    if (!ok || !data) {
      setBoard(prev);
      showToast({ message: data?.error ?? GENERIC_ERROR, tone: "bad" });
      return;
    }
    if (toWon && card.status !== "WON") {
      showWinBurst(burstAt?.x, burstAt?.y);
      showToast({ message: `${card.name} signed up 🎉`, tone: "good", undo: { cardId: card.id, payload: data.undo } });
    } else if (card.status === "LOST") {
      showToast({ message: `${card.name} is back on the board`, tone: "plain" });
    }
    refresh();
  }

  async function markLost(card: ConsoleLeadCard, reason: string) {
    const prev = board;
    setBoard((b) => b.filter((c) => c.id !== card.id));
    setOpenId(null);
    const { ok, data } = await postJson<{ undo: Undo }>(`/api/superadmin/leads/${card.id}`, { action: "lost", reason }, "PATCH");
    if (!ok || !data) {
      setBoard(prev);
      showToast({ message: data?.error ?? GENERIC_ERROR, tone: "bad" });
      return;
    }
    showToast({ message: `${card.name} marked lost`, tone: "plain", undo: { cardId: card.id, payload: data.undo } });
    refresh();
  }

  async function undo(cardId: string, payload: Undo) {
    setToast(null);
    const { ok, data } = await postJson(`/api/superadmin/leads/${cardId}`, { stageId: payload.stageId }, "PATCH");
    if (!ok) showToast({ message: data?.error ?? GENERIC_ERROR, tone: "bad" });
    refresh();
  }

  async function remove(card: ConsoleLeadCard) {
    const yes = await confirmSheet({
      title: `Delete ${card.name}?`,
      message: "The card is gone for good. A contact-form message stays in the Contact form inbox.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!yes) return;
    setOpenId(null);
    setBoard((b) => b.filter((c) => c.id !== card.id));
    const { ok, data } = await postJson(`/api/superadmin/leads/${card.id}`, undefined, "DELETE");
    if (!ok) showToast({ message: data?.error ?? GENERIC_ERROR, tone: "bad" });
    refresh();
  }

  function askLost(card: ConsoleLeadCard) {
    setLostReason("");
    setLostCard(card);
  }

  // ── drag and drop (desktop) ──────────────────────────────────────────────

  const dragProps = (card: ConsoleLeadCard) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", card.id);
      e.dataTransfer.effectAllowed = "move";
      setDragId(card.id);
    },
    onDragEnd: () => {
      setDragId(null);
      setHoverStage(null);
      setHoverZone(null);
    },
  });

  const dragged = (e: React.DragEvent) => {
    const id = dragId ?? e.dataTransfer.getData("text/plain");
    setDragId(null);
    return board.find((c) => c.id === id);
  };

  const dropProps = (stageId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (hoverStage !== stageId) setHoverStage(stageId);
    },
    onDragLeave: () => hoverStage === stageId && setHoverStage(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setHoverStage(null);
      const card = dragged(e);
      if (card) moveCard(card, stageId, { x: e.clientX, y: e.clientY });
    },
  });

  const zoneProps = (zone: "won" | "lost") => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (hoverZone !== zone) setHoverZone(zone);
    },
    onDragLeave: () => hoverZone === zone && setHoverZone(null),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setHoverZone(null);
      const card = dragged(e);
      if (!card) return;
      if (zone === "won" && wonStage) moveCard(card, wonStage.id, { x: e.clientX, y: e.clientY });
      else if (zone === "lost") askLost(card);
    },
  });

  const working = visible.filter((c) => c.status !== "WON");

  return (
    <DsPage className="!max-w-none">
      <PageHeader
        eyebrow={`${working.length} on the board`}
        title="Leads"
        info="People who might become WorkBench accounts. Every message from the Contact us form on workbenchfsm.com lands in the first column (marking it spam in Contact form takes it off). Add anyone else with New lead. Drag cards between columns, or onto Won / Lost while dragging; on a phone, tap a card. Customize renames, recolors, adds and reorders columns."
        actions={
          <>
            <Button variant="ghost" size="sm" icon={Archive} onClick={() => setShowLost(true)}>
              Lost{lost.length ? ` · ${lost.length}` : ""}
            </Button>
            <Button variant="ghost" size="sm" icon={Settings2} onClick={() => setCustomize(true)}>
              <span className="hidden sm:inline">Customize</span>
            </Button>
            <Button size="sm" icon={Plus} onClick={() => setAddingTo(workStages[0]?.id ?? null)}>
              New lead
            </Button>
          </>
        }
      />

      <div className="relative mt-5 mb-4 max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-faint)]" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, business, message…" className="w-full !py-1.5 pl-8" />
      </div>

      <div className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto px-4 pb-24 lg:mx-0 lg:snap-none lg:px-0 lg:pb-4">
        {stages.map((stage) => {
          const column = byStage.get(stage.id) ?? [];
          return (
            <div
              key={stage.id}
              className="w-[82vw] shrink-0 snap-center rounded-xl border p-2 sm:w-80 lg:w-72"
              style={{ backgroundColor: stageTint(stage.color, 0.06), borderColor: stageTint(stage.color, 0.28) }}
            >
              <div className="flex items-center justify-between px-1 pb-2 pt-0.5">
                <span className="stamp ink-themed" style={themedInkVars(stage.color)}>
                  {stage.isWon && <Trophy size={11} className="shrink-0" aria-hidden />}
                  {stage.name}
                  <span className="font-semibold normal-case tracking-normal text-[color:var(--ds-muted)]">{column.length}</span>
                </span>
                {!stage.isWon && (
                  <button
                    type="button"
                    onClick={() => setAddingTo(stage.id)}
                    className="rounded p-1 text-[color:var(--ds-faint)] transition-colors hover:bg-black/5 hover:text-[color:var(--ds-ink)]"
                    aria-label={`Add lead to ${stage.name}`}
                  >
                    <Plus size={14} />
                  </button>
                )}
              </div>

              <div
                {...dropProps(stage.id)}
                className={`-m-1 flex min-h-[140px] flex-col gap-2 rounded-lg p-1 transition-colors ${
                  hoverStage === stage.id && dragId ? "bg-[color:var(--ds-primary-soft)] ring-2 ring-dashed ring-[color:var(--ds-primary)]" : ""
                }`}
              >
                {addingTo === stage.id && (
                  <QuickAdd
                    stageId={stage.id}
                    onDone={(err) => {
                      setAddingTo(null);
                      if (err) showToast({ message: err, tone: "bad" });
                      else refresh();
                    }}
                    onCancel={() => setAddingTo(null)}
                  />
                )}
                {column.map((card) => (
                  <div
                    key={card.id}
                    {...dragProps(card)}
                    onClick={() => setOpenId(card.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ card, anchor: { x: e.clientX, y: e.clientY } });
                    }}
                    className={`ds-card cursor-pointer select-none p-3 transition-shadow hover:shadow-md active:cursor-grabbing lg:cursor-grab ${
                      dragId === card.id ? "opacity-40" : ""
                    }`}
                  >
                    <p className="truncate text-sm font-semibold text-[color:var(--ds-ink)]">{card.name}</p>
                    {card.businessName && <p className="ds-small truncate">{card.businessName}</p>}
                    {card.message && <p className="ds-small mt-1.5 line-clamp-2 text-[12.5px]">{card.message}</p>}
                    <div className="mt-2.5 flex items-center justify-between border-t border-[color:var(--ds-line)] pt-2">
                      <span className="flex items-center gap-2 text-[color:var(--ds-muted)]">
                        {card.email && <Mail size={12} aria-label="Has email" />}
                        {card.phone && <Phone size={12} aria-label="Has phone" />}
                        <span className="text-[11px]" title="Time in this column">
                          {daysIn(card.stageChangedAt)}
                        </span>
                      </span>
                      <span className="text-[11px] text-[color:var(--ds-muted)]">{sourceLabel(card.source)}</span>
                    </div>
                  </div>
                ))}
                {column.length === 0 && addingTo !== stage.id && (
                  <div className="rounded-lg border border-dashed border-[color:var(--ds-line-strong)] py-6 text-center text-xs text-[color:var(--ds-muted)]">
                    {stage.isWon ? "Sign-ups land here" : "No leads here"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Won / Lost drop zones — appear while dragging */}
      {dragId && (
        <div className="fixed bottom-6 left-1/2 z-40 hidden -translate-x-1/2 gap-3 lg:flex">
          <div
            {...zoneProps("won")}
            className={`flex items-center gap-2 rounded-full bg-[color:var(--ds-good)] px-8 py-4 text-sm font-bold text-[color:var(--ds-surface)] transition-transform ${
              hoverZone === "won" ? "scale-110" : "opacity-90"
            }`}
          >
            <Trophy size={18} /> Won
          </div>
          <div
            {...zoneProps("lost")}
            className={`flex items-center gap-2 rounded-full px-8 py-4 text-sm font-bold text-white transition-transform ${
              hoverZone === "lost" ? "scale-110 bg-gray-800" : "bg-gray-600"
            }`}
          >
            <XCircle size={18} /> Lost
          </div>
        </div>
      )}

      {menu && (
        <QuickMenu
          open
          anchor={menu.anchor}
          title={menu.card.name}
          onClose={() => setMenu(null)}
          actions={(() => {
            const c = menu.card;
            const out: QuickAction[] = [{ key: "open", label: "Open", icon: Pencil, onSelect: () => setOpenId(c.id) }];
            if (c.email) out.push({ key: "mail", label: "Email", icon: Mail, hint: c.email, href: `mailto:${c.email}` });
            if (c.phone) out.push({ key: "call", label: "Call", icon: Phone, hint: c.phone, href: `tel:${c.phone.replace(/[^\d+]/g, "")}` });
            const others = workStages.filter((s) => s.id !== c.stageId);
            if (others.length) out.push({ key: "h-move", label: "Move to", heading: true });
            for (const s of others) out.push({ key: `m-${s.id}`, label: s.name, icon: SquareKanban, onSelect: () => moveCard(c, s.id) });
            out.push({ key: "h-close", label: "Close", heading: true });
            if (wonStage && c.status !== "WON") out.push({ key: "won", label: "Mark won", icon: Trophy, onSelect: () => moveCard(c, wonStage.id) });
            out.push({ key: "lost", label: "Mark lost", icon: XCircle, onSelect: () => askLost(c) });
            out.push({ key: "del", label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(c) });
            return out;
          })()}
        />
      )}

      {openCard && (
        <LeadSheet
          key={openCard.id}
          card={openCard}
          stages={stages}
          onClose={() => setOpenId(null)}
          onMove={(stageId) => {
            setOpenId(null);
            moveCard(openCard, stageId);
          }}
          onLost={() => {
            setOpenId(null);
            askLost(openCard);
          }}
          onDelete={() => remove(openCard)}
          onSaved={(err) => (err ? showToast({ message: err, tone: "bad" }) : refresh())}
        />
      )}

      <Modal open={Boolean(lostCard)} onClose={() => setLostCard(null)} size="sm">
        {lostCard && (
          <>
            <h2 className="ds-h2 mb-3 flex items-center gap-1.5">
              Mark {lostCard.name} as lost?
              <InfoTip>The card leaves the board. The Lost list keeps it, and Reopen brings it back.</InfoTip>
            </h2>
            <Input
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Reason (optional): price, timing, went elsewhere…"
              maxLength={300}
              autoFocus
              className="mb-4 w-full"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setLostCard(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const c = lostCard;
                  setLostCard(null);
                  markLost(c, lostReason);
                }}
              >
                Mark lost
              </Button>
            </div>
          </>
        )}
      </Modal>

      <Modal open={showLost} onClose={() => setShowLost(false)} size="md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="ds-h2">Lost leads</h2>
          <button type="button" onClick={() => setShowLost(false)} className="ds-disc" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {lost.length === 0 ? (
          <p className="ds-small py-6 text-center">Nothing lost yet.</p>
        ) : (
          <div className="ds-divide max-h-[60vh] overflow-y-auto">
            {lost.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[color:var(--ds-ink)]">
                    {c.name}
                    {c.businessName && <span className="font-normal text-[color:var(--ds-muted)]"> · {c.businessName}</span>}
                  </span>
                  <span className="ds-small block truncate">
                    {c.lostAt ? fullDate(c.lostAt) : ""}
                    {c.lostReason ? ` · ${c.lostReason}` : ""}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  icon={RotateCcw}
                  onClick={() => {
                    setShowLost(false);
                    if (workStages[0]) moveCard(c, workStages[0].id);
                  }}
                >
                  Reopen
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {customize && (
        <CustomizeColumns
          stages={stages}
          onClose={() => setCustomize(false)}
          onSaved={() => {
            setCustomize(false);
            refresh();
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 right-4 z-50 max-w-sm lg:bottom-6">
          <div
            key={toast.message}
            className={`msg-enter ds-card flex items-center gap-3 px-4 py-3 text-sm font-medium ${
              toast.tone === "bad" ? "text-[color:var(--ds-bad)]" : "text-[color:var(--ds-ink)]"
            }`}
          >
            <span>{toast.message}</span>
            {toast.undo && (
              <button
                type="button"
                onClick={() => undo(toast.undo!.cardId, toast.undo!.payload)}
                className="flex shrink-0 items-center gap-1 font-semibold text-[color:var(--ds-primary)]"
              >
                <RotateCcw size={13} /> Undo
              </button>
            )}
            <button type="button" onClick={() => setToast(null)} className="shrink-0 text-[color:var(--ds-faint)]" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </DsPage>
  );
}

// ── Quick add (inline at the top of a column) ───────────────────────────────

function QuickAdd({ stageId, onDone, onCancel }: { stageId: string; onDone: (error?: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [business, setBusiness] = useState("");
  const [contact, setContact] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const isEmail = contact.includes("@");
    const { ok, data } = await postJson("/api/superadmin/leads", {
      name,
      businessName: business,
      email: isEmail ? contact : undefined,
      phone: !isEmail ? contact : undefined,
      stageId,
    });
    setSaving(false);
    onDone(ok ? undefined : (data?.error ?? GENERIC_ERROR));
  }

  return (
    <form onSubmit={submit} className="ds-card space-y-2 p-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus className="w-full !py-1.5" />
      <Input value={business} onChange={(e) => setBusiness(e.target.value)} placeholder="Business (optional)" className="w-full !py-1.5" />
      <Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email (optional)" className="w-full !py-1.5" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving || !name.trim()} className="flex-1">
          {saving ? "Adding…" : "Add lead"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

// ── The card sheet: details, notes, move, close out ─────────────────────────

function LeadSheet({
  card,
  stages,
  onClose,
  onMove,
  onLost,
  onDelete,
  onSaved,
}: {
  card: ConsoleLeadCard;
  stages: ConsoleStage[];
  onClose: () => void;
  onMove: (stageId: string) => void;
  onLost: () => void;
  onDelete: () => void;
  onSaved: (error?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: card.name,
    businessName: card.businessName ?? "",
    email: card.email ?? "",
    phone: card.phone ?? "",
  });
  const [notes, setNotes] = useState(card.notes ?? "");
  const [saving, setSaving] = useState(false);
  const isLost = card.status === "LOST";
  const won = stages.find((s) => s.isWon);

  async function save(body: Record<string, string>) {
    setSaving(true);
    const { ok, data } = await postJson(`/api/superadmin/leads/${card.id}`, body, "PATCH");
    setSaving(false);
    if (ok) setEditing(false);
    onSaved(ok ? undefined : (data?.error ?? GENERIC_ERROR));
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ds-h2 truncate">{card.name}</h2>
          <p className="ds-small">
            {[card.businessName, sourceLabel(card.source), fullDate(card.createdAt)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {card.status === "WON" && <Chip tone="good">Won</Chip>}
          {isLost && <Chip tone="neutral">Lost</Chip>}
          <button type="button" onClick={onClose} className="ds-disc" aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="mt-4 space-y-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="w-full" />
          <Input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="Business" className="w-full" />
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" className="w-full" />
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="w-full" />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving || !form.name.trim()} onClick={() => save(form)}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
          {card.email && (
            <a href={`mailto:${card.email}?subject=${encodeURIComponent("Re: WorkBench")}`} className="ds-link inline-flex items-center gap-1.5 break-all">
              <Mail size={13} /> {card.email}
            </a>
          )}
          {card.phone && (
            <a href={`tel:${card.phone.replace(/[^\d+]/g, "")}`} className="ds-link inline-flex items-center gap-1.5">
              <Phone size={13} /> {card.phone}
            </a>
          )}
          <button type="button" onClick={() => setEditing(true)} className="ds-link inline-flex items-center gap-1.5">
            <Pencil size={13} /> Edit
          </button>
        </div>
      )}

      {card.message && (
        <div className="mt-4 rounded-xl bg-[color:var(--ds-surface-2)] p-3">
          <p className="ds-label mb-1">Their message</p>
          <p className="whitespace-pre-line break-words text-[13.5px] text-[color:var(--ds-ink)]">{card.message}</p>
        </div>
      )}

      <p className="ds-label mt-4 mb-1">Notes</p>
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Calls, demo date, what they need…" className="w-full" />
      {notes !== (card.notes ?? "") && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={saving} onClick={() => save({ notes })}>
            Save notes
          </Button>
        </div>
      )}

      <p className="ds-label mt-5 mb-2">{isLost ? "Reopen in" : "Move to"}</p>
      <div className="space-y-1">
        {stages.map((s) => {
          const current = !isLost && s.id === card.stageId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => !current && onMove(s.id)}
              disabled={current}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                current ? "bg-[color:var(--ds-surface-2)] font-semibold text-[color:var(--ds-ink)]" : "text-[color:var(--ds-ink-2)] hover:bg-[color:var(--ds-surface-2)]"
              }`}
            >
              {s.isWon ? (
                <Trophy size={12} className="shrink-0 ink-themed" style={themedInkVars(s.color)} aria-hidden />
              ) : (
                <span className="bg-themed h-2 w-2 shrink-0 rounded-full" style={themedBgVars(s.color)} aria-hidden />
              )}
              {s.name}
              {current && <span className="ml-auto text-[10px] text-[color:var(--ds-faint)]">Current</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {!isLost && won && card.status !== "WON" && (
          <Button icon={Trophy} onClick={() => onMove(won.id)} className="flex-1">
            Won
          </Button>
        )}
        {!isLost && (
          <Button variant="outline" icon={XCircle} onClick={onLost} className="flex-1">
            Lost
          </Button>
        )}
        <Button variant="ghost" icon={Trash2} onClick={onDelete} className="hover:!text-[color:var(--ds-bad)]">
          Delete
        </Button>
      </div>
    </Modal>
  );
}

// ── Customize columns ───────────────────────────────────────────────────────

type Draft = { key: string; id?: string; name: string; color: string };

function CustomizeColumns({ stages, onClose, onSaved }: { stages: ConsoleStage[]; onClose: () => void; onSaved: () => void }) {
  const won = stages.find((s) => s.isWon);
  const [rows, setRows] = useState<Draft[]>(
    stages.filter((s) => !s.isWon).map((s) => ({ key: s.id, id: s.id, name: s.name, color: s.color ?? "#64748B" }))
  );
  const [wonRow, setWonRow] = useState({ name: won?.name ?? "Signed up", color: won?.color ?? "#22C55E" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const patch = (i: number, p: Partial<Draft>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const swap = (i: number, j: number) =>
    setRows((r) => {
      if (j < 0 || j >= r.length) return r;
      const next = [...r];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  async function save() {
    setError("");
    setSaving(true);
    const res = await fetch("/api/superadmin/lead-stages", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stages: rows.map(({ id, name, color }) => ({ id, name, color })), won: wonRow }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    onSaved();
  }

  return (
    <Modal open onClose={onClose} size="md">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="ds-h2 flex items-center gap-1.5">
          Customize columns
          <InfoTip>Rename, recolor, reorder, add or delete columns. Cards in a deleted column move to the first one. The Won column is always last and can only be renamed or recolored.</InfoTip>
        </h2>
        <button type="button" onClick={onClose} className="ds-disc" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="mb-3" />

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2">
            <input
              type="color"
              value={r.color}
              onChange={(e) => patch(i, { color: e.target.value })}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[color:var(--ds-line)] bg-transparent p-1"
              aria-label={`${r.name} color`}
            />
            <Input value={r.name} onChange={(e) => patch(i, { name: e.target.value })} maxLength={40} className="min-w-0 flex-1 !py-2" />
            <button type="button" onClick={() => swap(i, i - 1)} disabled={i === 0} className="ds-disc disabled:opacity-30" aria-label="Move up">
              <ArrowUp size={14} />
            </button>
            <button type="button" onClick={() => swap(i, i + 1)} disabled={i === rows.length - 1} className="ds-disc disabled:opacity-30" aria-label="Move down">
              <ArrowDown size={14} />
            </button>
            <button
              type="button"
              onClick={() => setRows((x) => x.filter((_, j) => j !== i))}
              disabled={rows.length <= 1}
              className="ds-disc hover:!text-[color:var(--ds-bad)] disabled:opacity-30"
              aria-label={`Delete ${r.name}`}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {rows.length < 12 && (
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            onClick={() => setRows((r) => [...r, { key: `new-${Date.now()}`, name: "New column", color: "#64748B" }])}
          >
            Add column
          </Button>
        )}

        <div className="flex items-center gap-2 border-t border-[color:var(--ds-line)] pt-3">
          <input
            type="color"
            value={wonRow.color}
            onChange={(e) => setWonRow({ ...wonRow, color: e.target.value })}
            className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-[color:var(--ds-line)] bg-transparent p-1"
            aria-label="Won column color"
          />
          <Input value={wonRow.name} onChange={(e) => setWonRow({ ...wonRow, name: e.target.value })} maxLength={40} className="min-w-0 flex-1 !py-2" />
          <span className="ds-small flex shrink-0 items-center gap-1">
            <Trophy size={12} /> Won, always last
          </span>
        </div>
      </div>

      {error && (
        <div role="alert" className="form-error mt-3">
          {error}
        </div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save columns"}
        </Button>
      </div>
    </Modal>
  );
}
