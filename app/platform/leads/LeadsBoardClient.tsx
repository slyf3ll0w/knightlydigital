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
  SquareKanban,
} from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { money } from "@/lib/statuses";
import { themedInkVars, themedBgVars } from "@/lib/section-colors";

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
}: {
  stages: BoardStage[];
  cards: BoardCard[];
  team: { id: string; name: string }[];
  manager: boolean;
  convertedOverflow?: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

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
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(t: Toast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }

  const refresh = () => startTransition(() => router.refresh());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return board.filter((c) => {
      if (assignee && c.assignedTo?.id !== assignee) return false;
      if (!q) return true;
      return [c.name, c.companyName ?? "", c.leadSource ?? "", c.email ?? "", c.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(q);
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

  async function closeCard(card: BoardCard, action: "won" | "lost", reason?: string) {
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
        if (zone === "won") closeCard(card, "won");
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
            className="rounded-[10px] btn-tool flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold transition-colors"
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
            placeholder="Search leads…"
            className="pl-8 pr-3 py-1.5 w-56 max-w-full text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500"
          />
        </div>
        {manager && team.length > 1 && (
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500/30"
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
        <div className="card-ledger p-10 text-center max-w-xl">
          <p className="text-base font-semibold text-gray-900 mb-1.5">No leads on the board yet</p>
          <p className="text-sm text-gray-500 mb-5">
            New website requests and webhook leads land here automatically — or add one yourself
            and drag it through your stages to Won.
          </p>
          {/* The columns (which normally host QuickAdd) aren't rendered while the
              board is empty, so render the add form here too — otherwise the
              button below just sets addingTo with nowhere to show the form. */}
          {addingTo ? (
            <div className="mx-auto max-w-xs text-left">
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
              className="rounded-[10px] btn-tool inline-flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold"
            >
              <Plus size={15} />
              Add a Lead
            </button>
          )}
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
                      ? "bg-green-500/10 ring-2 ring-green-500/40 ring-dashed"
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
                      className={`card-ledger p-3 cursor-pointer lg:cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow select-none ${
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
                          <span className="stamp text-blue-600 shrink-0" title="Has worked with you before">
                            Repeat
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
                    <div className="rounded-lg border border-dashed border-gray-300/60 py-6 text-center text-xs text-gray-400">
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
            className={`rounded-full flex items-center gap-2 px-8 py-4 text-sm font-bold text-white transition-transform ${
              hoverZone === "won" ? "bg-green-600 scale-110" : "bg-green-500"
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
      {lostCard && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setLostCard(null)}
        >
          <div className="card-ledger w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Mark {lostCard.name} as lost?
            </h2>
            <p className="text-sm text-gray-500 mb-3">
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
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-green-500/30"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLostCard(null)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
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
          </div>
        </div>
      )}

      {/* Toast (with undo) */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 max-w-sm">
          <div
            className={`card-ledger flex items-center gap-3 px-4 py-3 text-sm font-medium ${
              toast.tone === "red"
                ? "border-red-200 text-red-700"
                : toast.tone === "green"
                  ? "border-green-200 text-gray-900"
                  : "text-gray-700"
            }`}
          >
            <span>{toast.message}</span>
            {toast.undo && toast.undo.payload.stageId && (
              <button
                onClick={() => undoClose(toast.undo!.cardId, toast.undo!.payload)}
                className="flex items-center gap-1 text-green-600 hover:text-green-700 font-semibold shrink-0"
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
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parts = name.trim().split(/\s+/);
    if (parts.length === 0 || !parts[0]) return;
    setSaving(true);
    const isEmail = contact.includes("@");
    const { ok, data } = await postJson<{ id: string }>("/api/app/contacts", {
      firstName: parts[0],
      lastName: parts.slice(1).join(" ") || "—",
      email: isEmail ? contact.trim() : undefined,
      phone: !isEmail && contact.trim() ? contact.trim() : undefined,
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

  return (
    <form onSubmit={submit} className="card-ledger p-3 space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name"
        autoFocus
        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30"
      />
      <input
        value={contact}
        onChange={(e) => setContact(e.target.value)}
        placeholder="Phone or email (optional)"
        className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/30"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded-[10px] btn-tool flex-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white text-xs font-semibold"
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end lg:items-center lg:justify-center" onClick={onClose}>
      <div
        className="bg-white w-full lg:max-w-sm rounded-t-2xl lg:rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-gray-200 mb-3 lg:hidden" aria-hidden />
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
            href={`/app/contacts/${card.id}`}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800"
          >
            <UserRound size={15} />
            Open profile
          </Link>
          {card.phone ? (
            <a
              href={`tel:${card.phone.replace(/[^\d+]/g, "")}`}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-800"
            >
              <Phone size={15} />
              Call
            </a>
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
                <span className="ml-auto text-[10px] uppercase tracking-wide text-gray-400">
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
            className="rounded-[10px] btn-tool flex items-center justify-center gap-1.5 px-3 py-3 bg-green-500 hover:bg-green-600 text-white text-sm font-bold"
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
      </div>
    </div>
  );
}
