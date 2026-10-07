"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Settings2,
  Trophy,
  XCircle,
  FileText,
  CalendarClock,
  Inbox,
  Phone,
  UserRound,
  X,
  RotateCcw,
  Archive,
  SquareKanban,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { QuickMenu, type QuickAction } from "@/components/QuickMenu";
import CallLink from "@/components/CallLink";
import { callFromLine, useLineCalling } from "@/lib/line-calling";
import Modal from "@/components/Modal";
import PageTitle from "@/components/PageTitle";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticImpact } from "@/lib/haptics";
import { showWinBurst } from "@/lib/win-burst";
import { money } from "@/lib/statuses";
import { themedInkVars, themedBgVars } from "@/lib/section-colors";
import EmptyState from "@/components/EmptyState";
import { Chip, InfoTip } from "@/components/ds";

export type BoardStage = {
  id: string;
  name: string;
  color: string | null;
  autoAdvanceOn: string | null;
  isConverted: boolean;
};

export type BoardCard = {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  leadSource: string | null;
  stageId: string;
  stageChangedAt: string;
  repeat: boolean;
  value: number;
  assignedTo: { id: string; name: string } | null;
  openRequestId: string | null;
  counts: { requests: number; quotes: number; appointments: number };
  /** Lowercased address, notes and custom field values, joined server-side so
   *  the board can search them without shipping the raw Json down. */
  searchBlob: string;
};

/** A lead marked lost: off the board, listed under the header's Lost button. */
export type LostLead = {
  id: string;
  name: string;
  companyName: string | null;
  lostAt: string;
  lostReason: string | null;
  /** They had worked with the company before — restoring keeps them an active client */
  repeat: boolean;
};

type UndoPayload = {
  stageId: string | null;
  status: string;
  wonAt: string | null;
  lostAt: string | null;
  lostReason: string | null;
  timesWon: number;
};

type Toast = {
  message: string;
  tone: "green" | "gray" | "red";
  undo?: { cardId: string; payload: UndoPayload };
};

// Stage colors are user-picked, so they render through the app-wide
// theme guard (.ink-themed/.bg-themed + themedInkVars/themedBgVars):
// too-light picks flip to ink on the light theme, too-dark picks flip to
// paper on the dark theme — a black stage never disappears in dark mode.

/** The stage color at low alpha — column section backgrounds/borders. */
function stageTint(hex: string | null, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? "");
  const n = m ? parseInt(m[1], 16) : 0x0c0f0c;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function daysIn(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return "today";
  return `${days}d`;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function LeadsBoardClient({
  stages,
  cards,
  team,
  manager,
  convertedOverflow = 0,
  lost = [],
}: {
  stages: BoardStage[];
  cards: BoardCard[];
  team: { id: string; name: string }[];
  manager: boolean;
  convertedOverflow?: number;
  lost?: LostLead[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showLost, setShowLost] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Lost → back onto the board's first stage (the same "reopen" the undo toast uses)
  async function restoreLost(lead: LostLead) {
    const stageId = stages.find((s) => !s.isConverted)?.id;
    if (!stageId || restoringId) return;
    setRestoringId(lead.id);
    const { ok, data } = await postJson(`/api/app/contacts/${lead.id}/stage`, { action: "reopen", stageId }, "PATCH");
    setRestoringId(null);
    if (!ok) {
      showToast({ message: (data as { error?: string } | null)?.error ?? GENERIC_ERROR, tone: "red" });
      return;
    }
    hapticImpact("LIGHT");
    showToast({ message: `${lead.name} is back on the board`, tone: "gray" });
    startTransition(() => router.refresh());
  }
  // "Call" dials from the business line when the company has one (lib/line-calling.ts).
  const lineCalling = useLineCalling();

  // Optimistic copy — resets whenever the server sends fresh cards
  const [board, setBoard] = useState<BoardCard[]>(cards);
  useEffect(() => setBoard(cards), [cards]);

  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<"won" | "lost" | null>(null);
  const [sheetCard, setSheetCard] = useState<BoardCard | null>(null);
  const [lostCard, setLostCard] = useState<BoardCard | null>(null);
  const [lostReason, setLostReason] = useState("");
  // right-click (desktop) / long-press (Android) on a card: the same verbs as the touch sheet
  const [menu, setMenu] = useState<{ card: BoardCard; anchor: { x: number; y: number } } | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(t: Toast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }

  const refresh = () => {
    // The rail's Leads count reads the board's entry stage; tell the shell a
    // card moved so the badge settles now, not on the next 45 s poll.
    window.dispatchEvent(new CustomEvent("wb:nav-counts"));
    startTransition(() => router.refresh());
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board.filter((c) => {
      if (assignee && c.assignedTo?.id !== assignee) return false;
      if (!q) return true;
      return (
        [c.name, c.companyName ?? "", c.leadSource ?? "", c.email ?? "", c.phone ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q) ||
        c.searchBlob.includes(q) ||
        // Digits-only, so "(214) 555" finds a lead stored as 214-555-0142
        (q.replace(/\D/g, "").length >= 3 &&
          (c.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, "")))
      );
    });
  }, [board, query, assignee]);

  const byStage = useMemo(() => {
    const map = new Map<string, BoardCard[]>(stages.map((s) => [s.id, []]));
    for (const c of visible) map.get(c.stageId)?.push(c);
    return map;
  }, [stages, visible]);

  // ── moves ──────────────────────────────────────────────────────────────────

  async function moveCard(card: BoardCard, stageId: string) {
    if (card.stageId === stageId) return;
    const prev = board;
    setBoard((b) => [
      { ...card, stageId, stageChangedAt: new Date().toISOString() },
      ...b.filter((c) => c.id !== card.id),
    ]);
    const { ok, data } = await postJson(`/api/app/contacts/${card.id}/stage`, { stageId }, "PATCH");
    if (!ok) {
      setBoard(prev);
      showToast({ message: data?.error ?? GENERIC_ERROR, tone: "red" });
      return;
    }
    refresh();
  }

  async function closeCard(
    card: BoardCard,
    action: "won" | "lost",
    reason?: string,
    burstAt?: { x: number; y: number }
  ) {
    const prev = board;
    setBoard((b) => b.filter((c) => c.id !== card.id));
    setSheetCard(null);
    const { ok, data } = await postJson<{ undo: UndoPayload }>(
      `/api/app/contacts/${card.id}/stage`,
      action === "won" ? { action } : { action, reason },
      "PATCH"
    );
    if (!ok || !data) {
      setBoard(prev);
      showToast({ message: (data as { error?: string } | null)?.error ?? GENERIC_ERROR, tone: "red" });
      return;
    }
    if (action === "won") {
      // A win sparks (from the drop point on desktop, near the toast
      // otherwise) — smaller than paid-invoice confetti on purpose
      hapticImpact("LIGHT");
      showWinBurst(burstAt?.x, burstAt?.y);
    }
    showToast(
      action === "won"
        ? {
            message: `${card.name} is now a client 🎉`,
            tone: "green",
            undo: { cardId: card.id, payload: data.undo },
          }
        : {
            message: `${card.name} marked lost`,
            tone: "gray",
            undo: { cardId: card.id, payload: data.undo },
          }
    );
    refresh();
  }

  async function undoClose(cardId: string, payload: UndoPayload) {
    if (!payload.stageId) return;
    setToast(null);
    const { ok, data } = await postJson(
      `/api/app/contacts/${cardId}/stage`,
      { action: "reopen", ...payload },
      "PATCH"
    );
    if (!ok) {
      showToast({ message: data?.error ?? GENERIC_ERROR, tone: "red" });
      return;
    }
    refresh();
  }

  // ── drag and drop (desktop) ────────────────────────────────────────────────

  function dragProps(card: BoardCard) {
    return {
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
    };
  }

  function dropProps(stageId: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (hoverStage !== stageId) setHoverStage(stageId);
      },
      onDragLeave: () => {
        if (hoverStage === stageId) setHoverStage(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setHoverStage(null);
        const id = dragId ?? e.dataTransfer.getData("text/plain");
        const card = board.find((c) => c.id === id);
        setDragId(null);
        if (card) moveCard(card, stageId);
      },
    };
  }

  function zoneProps(zone: "won" | "lost") {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (hoverZone !== zone) setHoverZone(zone);
      },
      onDragLeave: () => {
        if (hoverZone === zone) setHoverZone(null);
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setHoverZone(null);
        const id = dragId ?? e.dataTransfer.getData("text/plain");
        const card = board.find((c) => c.id === id);
        setDragId(null);
        if (!card) return;
        if (zone === "won") closeCard(card, "won", undefined, { x: e.clientX, y: e.clientY });
        else {
          setLostReason("");
          setLostCard(card);
        }
      },
    };
  }

  // ── card click: touch opens the action sheet, pointer opens the client ───

  function onCardClick(card: BoardCard) {
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
      setSheetCard(card);
    } else {
      router.push(`/app/contacts/${card.id}`);
    }
  }

  // Header stats count the working pipeline, not the Converted archive
  const convertedStageId = stages.find((s) => s.isConverted)?.id;
  const working = visible.filter((c) => c.stageId !== convertedStageId);
  const totalValue = working.reduce((s, c) => s + c.value, 0);

  return (
    <div className="p-4 lg:p-8 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4 max-w-none">
        <div className="flex items-baseline gap-3">
          <PageTitle section="leads" icon={SquareKanban}>
            Leads
          </PageTitle>
          <span className="text-sm text-gray-500">
            {working.length} on the board
            {totalValue > 0 && (
              <>
                {" · "}
                <span className="numeral-ledger font-semibold text-gray-700">
                  {money(totalValue)}
                </span>{" "}
                quoted
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLost(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Leads marked lost"
          >
            <Archive size={15} />
            <span>
              Lost{lost.length > 0 && <span className="ml-1 text-gray-400 numeral-ledger">{lost.length}</span>}
            </span>
          </button>
          {manager && (
            <Link
              href="/app/settings/pipeline"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <Settings2 size={15} />
              <span className="hidden sm:inline">Customize board</span>
            </Link>
          )}
          <button
            onClick={() => setAddingTo(stages[0]?.id ?? null)}
            className="btn-primary"
          >
            <Plus size={15} />
            New Lead
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, address, custom fields…"
            className="pl-8 pr-3 py-1.5 w-56 max-w-full text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary-soft)] focus:border-[color:var(--ds-primary)]"
          />
        </div>
        {manager && team.length > 1 && (
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary-soft)]"
          >
            <option value="">Everyone</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Board */}
      {board.length === 0 ? (
        <div className="ds-card max-w-xl">
          <EmptyState
            icon={SquareKanban}
            hue="var(--ds-primary)"
            title="No leads on the board yet"
            body="New website requests and webhook leads land here automatically — or add one yourself and drag it through your stages to Won."
          >
          {/* The columns (which normally host QuickAdd) aren't rendered while the
              board is empty, so render the add form here too — otherwise the
              button below just sets addingTo with nowhere to show the form. */}
          {addingTo ? (
            <div className="mx-auto mt-5 w-full max-w-xs text-left">
              <QuickAdd
                stageId={addingTo}
                firstStageId={stages[0]?.id ?? addingTo}
                onDone={(err) => {
                  setAddingTo(null);
                  if (err) showToast({ message: err, tone: "red" });
                  else refresh();
                }}
                onCancel={() => setAddingTo(null)}
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingTo(stages[0]?.id ?? null)}
              disabled={!stages[0]?.id}
              className="btn-primary mt-5 inline-flex"
            >
              <Plus size={15} />
              Add a Lead
            </button>
          )}
          </EmptyState>
        </div>
      ) : (
        // Horizontal scroller — the scrollbar stays VISIBLE (app-ui slim
        // style): with it hidden, desktop mouse users had no way to reach
        // off-screen stages. Touch swipes; desktop gets the bar + shift-wheel.
        <div className="flex-1 flex gap-3 overflow-x-auto pb-24 lg:pb-4 items-start snap-x snap-mandatory lg:snap-none -mx-4 px-4 lg:mx-0 lg:px-0">
          {stages.map((stage) => {
            const columnCards = byStage.get(stage.id) ?? [];
            const columnValue = columnCards.reduce((s, c) => s + c.value, 0);
            return (
              <div
                key={stage.id}
                className="w-[82vw] sm:w-80 lg:w-72 shrink-0 snap-center lg:snap-align-none rounded-xl border p-2"
                style={{
                  backgroundColor: stageTint(stage.color, stage.isConverted ? 0.05 : 0.06),
                  borderColor: stageTint(stage.color, 0.28),
                }}
              >
                {/* Column header */}
                <div className="flex items-center justify-between px-1 pb-2 pt-0.5">
                  <span className="stamp ink-themed" style={themedInkVars(stage.color)}>
                    {stage.isConverted && <Trophy size={11} className="shrink-0" aria-hidden />}
                    {stage.name}
                    <span className="text-gray-400 normal-case tracking-normal font-semibold">
                      {columnCards.length + (stage.isConverted ? convertedOverflow : 0)}
                    </span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {columnValue > 0 && !stage.isConverted && (
                      <span className="numeral-ledger text-[11px] font-semibold text-gray-500">
                        {money(columnValue)}
                      </span>
                    )}
                    {!stage.isConverted && (
                      <button
                        onClick={() => setAddingTo(stage.id)}
                        className="p-1 text-gray-400 hover:text-gray-700 hover:bg-black/5 rounded transition-colors"
                        aria-label={`Add lead to ${stage.name}`}
                      >
                        <Plus size={14} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Column body (drop target) */}
                <div
                  {...dropProps(stage.id)}
                  className={`flex flex-col gap-2 min-h-[140px] rounded-lg p-1 -m-1 transition-colors ${
                    hoverStage === stage.id && dragId
                      ? "bg-[color:var(--ds-primary-soft)] ring-2 ring-[color:var(--ds-primary)] ring-dashed"
                      : ""
                  }`}
                >
                  {addingTo === stage.id && (
                    <QuickAdd
                      stageId={stage.id}
                      firstStageId={stages[0]?.id ?? stage.id}
                      onDone={(err) => {
                        setAddingTo(null);
                        if (err) showToast({ message: err, tone: "red" });
                        else refresh();
                      }}
                      onCancel={() => setAddingTo(null)}
                    />
                  )}
                  {columnCards.map((card) => (
                    <div
                      key={card.id}
                      {...dragProps(card)}
                      onClick={() => onCardClick(card)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMenu({ card, anchor: { x: e.clientX, y: e.clientY } });
                      }}
                      className={`ds-card p-3 cursor-pointer lg:cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow select-none ${
                        dragId === card.id ? "opacity-40" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {card.name}
                          </p>
                          {card.companyName && (
                            <p className="text-xs text-gray-500 truncate">{card.companyName}</p>
                          )}
                        </div>
                        {card.repeat && (
                          <span className="shrink-0" title="Has worked with you before">
                            <Chip tone="primary">Repeat</Chip>
                          </span>
                        )}
                      </div>

                      {(card.value > 0 || card.leadSource) && (
                        <div className="flex items-center justify-between gap-2 mt-2">
                          <span className="text-xs text-gray-500 truncate">
                            {card.leadSource ?? ""}
                          </span>
                          {card.value > 0 && (
                            <span className="numeral-ledger text-sm font-semibold text-gray-900 shrink-0">
                              {money(card.value)}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-100">
                        <div className="flex items-center gap-2 text-gray-400">
                          {card.counts.requests > 0 && (
                            <span className="flex items-center gap-0.5 text-[11px]" title="Requests">
                              <Inbox size={12} />
                              {card.counts.requests}
                            </span>
                          )}
                          {card.counts.quotes > 0 && (
                            <span className="flex items-center gap-0.5 text-[11px]" title="Quotes">
                              <FileText size={12} />
                              {card.counts.quotes}
                            </span>
                          )}
                          {card.counts.appointments > 0 && (
                            <span
                              className="flex items-center gap-0.5 text-[11px]"
                              title="Upcoming appointments"
                            >
                              <CalendarClock size={12} />
                              {card.counts.appointments}
                            </span>
                          )}
                          <span className="text-[11px]" title="Time in this stage">
                            {daysIn(card.stageChangedAt)}
                          </span>
                        </div>
                        {card.assignedTo && (
                          <span
                            className="w-5 h-5 rounded-full bg-gray-900 text-white text-[9px] font-bold flex items-center justify-center"
                            title={`Assigned to ${card.assignedTo.name}`}
                          >
                            {initials(card.assignedTo.name)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {columnCards.length === 0 && addingTo !== stage.id && (
                    <div className="rounded-lg border border-dashed border-gray-300/60 py-6 text-center text-xs text-gray-500">
                      {stage.isConverted ? "Wins land here — they become clients" : "No leads here"}
                    </div>
                  )}
                  {stage.isConverted && convertedOverflow > 0 && (
                    <Link
                      href="/app/contacts"
                      className="block text-center text-[11px] text-gray-500 hover:text-gray-700 py-1.5"
                    >
                      +{convertedOverflow} more — see Clients
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Won / Lost drop zones — appear while dragging */}
      {dragId && (
        <div className="hidden lg:flex fixed bottom-6 left-1/2 -translate-x-1/2 z-40 gap-3">
          <div
            {...zoneProps("won")}
            className={`rounded-full flex items-center gap-2 px-8 py-4 text-sm font-bold text-[color:var(--ds-surface)] transition-transform ${
              hoverZone === "won" ? "bg-[color:var(--ds-good)] scale-110" : "bg-[color:var(--ds-good)] opacity-90"
            }`}
          >
            <Trophy size={18} />
            Won — now a client
          </div>
          <div
            {...zoneProps("lost")}
            className={`rounded-full flex items-center gap-2 px-8 py-4 text-sm font-bold text-white transition-transform ${
              hoverZone === "lost" ? "bg-gray-800 scale-110" : "bg-gray-600"
            }`}
          >
            <XCircle size={18} />
            Lost
          </div>
        </div>
      )}

      {/* Right-click quick actions */}
      {menu && (
        <QuickMenu
          open
          anchor={menu.anchor}
          title={menu.card.name}
          onClose={() => setMenu(null)}
          actions={(() => {
            const c = menu.card;
            const out: QuickAction[] = [
              { key: "open", label: "Open profile", icon: ExternalLink, href: `/app/contacts/${c.id}` },
              { key: "edit", label: "Edit", icon: Pencil, href: `/app/contacts/${c.id}/edit` },
            ];
            if (c.phone) {
              const phone = c.phone;
              out.push(
                lineCalling
                  ? { key: "call", label: "Call", icon: Phone, hint: phone, onSelect: () => callFromLine({ contactId: c.id, to: phone, label: c.name }) }
                  : { key: "call", label: "Call", icon: Phone, hint: phone, href: `tel:${phone.replace(/[^\d+]/g, "")}` }
              );
            }
            out.push({ key: "quote", label: "New quote", icon: FileText, href: `/app/quotes/new?contactId=${c.id}${c.openRequestId ? `&requestId=${c.openRequestId}` : ""}` });
            const others = stages.filter((s) => !s.isConverted && s.id !== c.stageId);
            if (others.length > 0) out.push({ key: "h-move", label: "Move to", heading: true });
            for (const s of others) out.push({ key: `move-${s.id}`, label: s.name, icon: SquareKanban, onSelect: () => moveCard(c, s.id) });
            out.push({ key: "h-close", label: "Close", heading: true });
            out.push({ key: "won", label: "Mark won", icon: Trophy, onSelect: () => closeCard(c, "won") });
            out.push({
              key: "lost",
              label: "Mark lost",
              icon: XCircle,
              destructive: true,
              onSelect: () => {
                setLostReason("");
                setLostCard(c);
              },
            });
            return out;
          })()}
        />
      )}

      {/* Mobile action sheet */}
      {sheetCard && (
        <ActionSheet
          card={sheetCard}
          stages={stages.filter((s) => !s.isConverted)}
          onClose={() => setSheetCard(null)}
          onMove={(stageId) => {
            setSheetCard(null);
            moveCard(sheetCard, stageId);
          }}
          onWon={() => closeCard(sheetCard, "won")}
          onLost={() => {
            setSheetCard(null);
            setLostReason("");
            setLostCard(sheetCard);
          }}
        />
      )}

      {/* Lost reason */}
      {/* Lost leads — off the board, restorable to the first stage */}
      <Modal open={showLost} onClose={() => setShowLost(false)} size="md">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1 text-base font-semibold text-[color:var(--ds-ink)]">
            <span>Lost leads</span>
            <InfoTip>Restore puts them back in the first stage. Lost leads also sit under Contacts → Lost leads.</InfoTip>
          </h2>
          <button type="button" onClick={() => setShowLost(false)} className="rounded-full p-1.5 text-[color:var(--ds-faint)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-ink-2)]" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {lost.length === 0 ? (
          <p className="py-8 text-center text-sm text-[color:var(--ds-muted)]">Nothing lost yet. Drop a card on Lost, or use its menu, and it lands here.</p>
        ) : (
          <div className="divide-y divide-[color:var(--ds-line)] max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {lost.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-2.5">
                <Link href={`/app/contacts/${l.id}`} className="min-w-0 flex-1 group">
                  <span className="block truncate text-sm font-medium text-[color:var(--ds-ink)] group-hover:underline">
                    {l.name}
                    {l.companyName && <span className="font-normal text-[color:var(--ds-muted)]"> · {l.companyName}</span>}
                    {l.repeat && <span className="ml-1.5 text-xs font-normal text-[color:var(--ds-faint)]">client</span>}
                  </span>
                  <span className="block truncate text-xs text-[color:var(--ds-muted)]">
                    {new Date(l.lostAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {l.lostReason ? ` · ${l.lostReason}` : ""}
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => restoreLost(l)}
                  disabled={restoringId === l.id}
                  className="shrink-0 rounded-lg border border-[color:var(--ds-line)] px-2.5 py-1.5 text-xs font-medium text-[color:var(--ds-ink-2)] hover:bg-[color:var(--ds-surface-2)] disabled:opacity-50"
                >
                  <span className="flex items-center gap-1">
                    <RotateCcw size={12} />
                    Restore
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(lostCard)}
        onClose={() => setLostCard(null)}
        size="sm"
      >
        {lostCard && (
          <>
            <h2 className="text-base font-semibold text-[color:var(--ds-ink)] mb-1">
              Mark {lostCard.name} as lost?
            </h2>
            <p className="text-sm text-[color:var(--ds-muted)] mb-3">
              {lostCard.repeat
                ? "They stay an active client — this just takes them off the board."
                : "The lead is archived — a new request from them brings them back."}
            </p>
            <input
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              placeholder="Reason (optional) — price, timing, went elsewhere…"
              maxLength={300}
              autoFocus
              className="w-full px-3 py-2 text-sm text-[color:var(--ds-ink)] placeholder:text-[color:var(--ds-faint)] border border-[color:var(--ds-line)] rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary-soft)]"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLostCard(null)}
                className="px-4 py-2 text-sm font-medium text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)] rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const c = lostCard;
                  setLostCard(null);
                  closeCard(c, "lost", lostReason);
                }}
                className="rounded-[10px] px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-sm font-semibold"
              >
                Mark Lost
              </button>
            </div>
          </>
        )}
      </Modal>


      {/* Toast (with undo) */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 max-w-sm">
          <div
            key={toast.message}
            className={`msg-enter ds-card flex items-center gap-3 px-4 py-3 text-sm font-medium ${
              toast.tone === "red"
                ? "border-red-200 text-red-700"
                : toast.tone === "green"
                  ? "text-[color:var(--ds-ink)]"
                  : "text-gray-700"
            }`}
          >
            <span>{toast.message}</span>
            {toast.undo && toast.undo.payload.stageId && (
              <button
                onClick={() => undoClose(toast.undo!.cardId, toast.undo!.payload)}
                className="flex items-center gap-1 text-[color:var(--ds-primary)] hover:text-[color:var(--ds-primary-strong)] font-semibold shrink-0"
              >
                <RotateCcw size={13} />
                Undo
              </button>
            )}
            <button
              onClick={() => setToast(null)}
              className="text-gray-400 hover:text-gray-600 shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Quick add (inline mini-form at the top of a column) ─────────────────────

function QuickAdd({
  stageId,
  firstStageId,
  onDone,
  onCancel,
}: {
  stageId: string;
  firstStageId: string;
  onDone: (error?: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  // "More details" opens the rest of a lead's basics without leaving the board
  const [more, setMore] = useState(false);
  const [extra, setExtra] = useState({
    companyName: "",
    email: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    leadSource: "",
    notes: "",
  });
  const setX = (k: keyof typeof extra, v: string) => setExtra((x) => ({ ...x, [k]: v }));
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return;
    setSaving(true);
    // Collapsed: one box takes a phone OR an email. Expanded: the box is the
    // phone and email gets its own field.
    const isEmail = !more && contact.includes("@");
    const t = (v: string) => v.trim() || undefined;
    const { ok, data } = await postJson<{ id: string }>("/api/app/contacts", {
      firstName: parts[0],
      lastName: parts.slice(1).join(" "),
      email: more ? t(extra.email) : isEmail ? contact.trim() : undefined,
      phone: !isEmail && contact.trim() ? contact.trim() : undefined,
      ...(more
        ? {
            companyName: t(extra.companyName),
            address: t(extra.address),
            city: t(extra.city),
            state: t(extra.state.toUpperCase()),
            zip: t(extra.zip),
            leadSource: t(extra.leadSource),
            notes: t(extra.notes),
          }
        : {}),
    });
    if (!ok || !data) {
      setSaving(false);
      onDone(data?.error ?? GENERIC_ERROR);
      return;
    }
    // New contacts enter the first stage — nudge them to this column if needed
    if (stageId !== firstStageId) {
      await postJson(`/api/app/contacts/${data.id}/stage`, { stageId }, "PATCH");
    }
    setSaving(false);
    onDone();
  }

  const box =
    "w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary-soft)]";

  return (
    <form onSubmit={submit} className="ds-card p-3 space-y-2">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" autoFocus className={box} />
      <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder={more ? "Phone (optional)" : "Phone or email (optional)"}
        type={more ? "tel" : "text"}
        className={box}
      />
      {more ? (
        <>
          <input value={extra.email} onChange={(e) => setX("email", e.target.value)} placeholder="Email (optional)" type="email" className={box} />
          <input value={extra.companyName} onChange={(e) => setX("companyName", e.target.value)} placeholder="Company (optional)" className={box} />
          <input value={extra.address} onChange={(e) => setX("address", e.target.value)} placeholder="Street address" autoComplete="off" className={box} />
          <div className="grid grid-cols-[1fr_3.5rem_4.5rem] gap-1.5">
            <input value={extra.city} onChange={(e) => setX("city", e.target.value)} placeholder="City" className={box} />
            <input value={extra.state} onChange={(e) => setX("state", e.target.value.slice(0, 2))} placeholder="ST" aria-label="State" className={box} />
            <input value={extra.zip} onChange={(e) => setX("zip", e.target.value.slice(0, 10))} placeholder="ZIP" inputMode="numeric" className={box} />
          </div>
          <input value={extra.leadSource} onChange={(e) => setX("leadSource", e.target.value)} placeholder="Lead source (Referral, Google…)" className={box} />
          <textarea
            value={extra.notes}
            onChange={(e) => setX("notes", e.target.value)}
            placeholder="Notes: what they need, best time to call…"
            rows={3}
            className={`${box} resize-y`}
          />
          <Link href="/app/contacts/new?type=lead" className="ds-link block text-xs">
            Open the full lead form
          </Link>
        </>
      ) : (
        <button type="button" onClick={() => setMore(true)} className="ds-link text-xs">
          + More details
        </button>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="btn-primary btn-sm flex-1"
        >
          {saving ? "Adding…" : "Add lead"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Mobile action sheet (touch replaces drag) ───────────────────────────────

function ActionSheet({
  card,
  stages,
  onClose,
  onMove,
  onWon,
  onLost,
}: {
  card: BoardCard;
  stages: BoardStage[];
  onClose: () => void;
  onMove: (stageId: string) => void;
  onWon: () => void;
  onLost: () => void;
}) {
  return (
    <Modal open onClose={onClose} size="sm">
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-base font-semibold text-gray-900">{card.name}</p>
            <p className="text-xs text-gray-500">
              {[card.companyName, card.leadSource].filter(Boolean).join(" · ") || "Lead"}
              {card.repeat && " · Repeat client"}
            </p>
          </div>
          {card.value > 0 && (
            <span className="numeral-ledger text-base font-semibold text-gray-900">
              {money(card.value)}
            </span>
          )}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Link
            prefetch={false} href={`/app/contacts/${card.id}`}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800"
          >
            <UserRound size={15} />
            Open profile
          </Link>
          {card.phone ? (
            <CallLink
              phone={card.phone}
              contactId={card.id}
              name={card.name}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800"
            >
              <Phone size={15} />
              Call
            </CallLink>
          ) : (
            <Link
              href={`/app/quotes/new?contactId=${card.id}${card.openRequestId ? `&requestId=${card.openRequestId}` : ""}`}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800"
            >
              <FileText size={15} />
              New quote
            </Link>
          )}
          <Link
            href={`/app/appointments/new?contactId=${card.id}`}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800"
          >
            <CalendarClock size={15} />
            Appointment
          </Link>
          {card.phone && (
            <Link
              href={`/app/quotes/new?contactId=${card.id}${card.openRequestId ? `&requestId=${card.openRequestId}` : ""}`}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800"
            >
              <FileText size={15} />
              New quote
            </Link>
          )}
        </div>

        {/* Move to stage */}
        <p className="stamp text-gray-500 mt-5 mb-2">Move to stage</p>
        <div className="space-y-1">
          {stages.map((s) => (
            <button
              key={s.id}
              onClick={() => s.id !== card.stageId && onMove(s.id)}
              disabled={s.id === card.stageId}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-left transition-colors ${
                s.id === card.stageId
                  ? "bg-gray-100 font-semibold text-gray-900"
                  : "hover:bg-gray-50 text-gray-700"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 bg-themed"
                style={themedBgVars(s.color)}
                aria-hidden
              />
              {s.name}
              {s.id === card.stageId && (
                <span className="ml-auto text-[10px] text-gray-400">
                  Current
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Close out */}
        <div className="grid grid-cols-2 gap-2 mt-5">
          <button
            onClick={onWon}
            className="rounded-[10px] flex items-center justify-center gap-1.5 px-3 py-3 bg-[color:var(--ds-good)] hover:opacity-90 text-[color:var(--ds-surface)] text-sm font-bold"
          >
            <Trophy size={15} />
            Won
          </button>
          <button
            onClick={onLost}
            className="rounded-[10px] flex items-center justify-center gap-1.5 px-3 py-3 bg-gray-700 hover:bg-gray-800 text-white text-sm font-bold"
          >
            <XCircle size={15} />
            Lost
          </button>
        </div>
    </Modal>
  );
}
