"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import LeadSourceField from "@/components/LeadSourceField";
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
  ChevronsLeft,
  ListChecks,
} from "lucide-react";
import { monogramColor } from "@/components/Monogram";
import { QuickMenu, type QuickAction } from "@/components/QuickMenu";
import CallLink from "@/components/CallLink";
import UseMyLocation from "@/components/UseMyLocation";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { formatPhoneAsTyped, looksLikePhone, titleCaseName } from "@/lib/phone-input";
import { callFromLine, useLineCalling } from "@/lib/line-calling";
import Modal from "@/components/Modal";
import PageTitle from "@/components/PageTitle";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticImpact } from "@/lib/haptics";
import { showWinBurst } from "@/lib/win-burst";
import { money } from "@/lib/statuses";
import { themedInkVars, themedBgVars } from "@/lib/section-colors";
import EmptyState from "@/components/EmptyState";
import BoardScroller from "@/components/BoardScroller";
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
  /** The next step: the soonest booked appointment, else the soonest open task */
  next: { kind: "appointment" | "task"; at: string | null; title: string } | null;
  createdAt: string;
  /** Lowercased address, notes and custom field values, joined server-side so
   *  the board can search them without shipping the raw Json down. */
  searchBlob: string;
};

/** A lead off the board — marked lost, or archived from its own page — listed under the header's Lost & archived button. */
export type LostLead = {
  id: string;
  name: string;
  companyName: string | null;
  /** Null = archived from the lead's own page, never marked lost */
  lostAt: string | null;
  /** When it left the board (lostAt, or the archive's last change) */
  offAt: string;
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

type LeadSort = "board" | "value" | "age" | "newest";

/** Days in the current stage. Amber at a week, red at two — the default every CRM ships. */
const STALE_WARN = 7;
const STALE_BAD = 14;
function daysOf(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}
function staleLevel(c: BoardCard): "warn" | "bad" | null {
  const d = daysOf(c.stageChangedAt);
  return d >= STALE_BAD ? "bad" : d >= STALE_WARN ? "warn" : null;
}
function daysWord(iso: string): string {
  const d = daysOf(iso);
  return d === 0 ? "Today" : d === 1 ? "1 day" : `${d} days`;
}
function shortWhen(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" AM", "a").replace(" PM", "p");
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Tomorrow ${time}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
/** The card's bottom line: what happens next, or that nothing does. */
function nextLine(c: BoardCard): { kind: "appointment" | "task" | null; text: string; title: string; tone: "bad" | "warn" | null } {
  if (c.next) {
    const late = c.next.at ? new Date(c.next.at).getTime() < Date.now() - 3_600_000 : false;
    const when = c.next.at ? shortWhen(c.next.at) : "No date";
    const text = `${when} · ${c.next.title}`;
    return { kind: c.next.kind, text, title: `${c.next.kind === "appointment" ? "Appointment" : "Task"}: ${c.next.title}${c.next.at ? ` · ${when}` : ""}`, tone: late ? "bad" : null };
  }
  const stale = staleLevel(c);
  return { kind: null, text: "No next step", title: "Nothing booked and no open task", tone: stale ? "warn" : null };
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
  won30 = 0,
}: {
  stages: BoardStage[];
  cards: BoardCard[];
  team: { id: string; name: string }[];
  manager: boolean;
  convertedOverflow?: number;
  lost?: LostLead[];
  /** Wins in the last 30 days (the board tail and the reach rates) */
  won30?: number;
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
  const [source, setSource] = useState("");
  const [staleOnly, setStaleOnly] = useState(false);
  const [sort, setSort] = useState<LeadSort>("board");
  const [peek, setPeek] = useState<{ card: BoardCard; x: number; y: number } | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Collapsed columns stay collapsed on this device; the Converted archive starts folded
  const [collapsed, setCollapsed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wb:leads:collapsed");
      if (saved) setCollapsed(JSON.parse(saved) as string[]);
      else {
        const conv = stages.find((s) => s.isConverted)?.id;
        if (conv) setCollapsed([conv]);
      }
    } catch {
      /* private mode */
    }
  }, [stages]);
  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("wb:leads:collapsed", JSON.stringify(next));
      } catch {
        /* private mode */
      }
      return next;
    });
  }
  const sources = useMemo(() => [...new Set(cards.map((c) => c.leadSource).filter((x): x is string => Boolean(x)))].sort(), [cards]);
  function sortCards(list: BoardCard[]): BoardCard[] {
    if (sort === "board") return list;
    const out = [...list];
    if (sort === "value") out.sort((a, b) => b.value - a.value);
    else if (sort === "age") out.sort((a, b) => a.stageChangedAt.localeCompare(b.stageChangedAt));
    else out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return out;
  }
  const [dragId, setDragId] = useState<string | null>(null);
  // Smoother board (2026-11-24): moves after the first paint animate — a card
  // settles into its new column, a column opens or folds — but the board
  // doesn't play all of that on load.
  const [live, setLive] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLive(true), 700);
    return () => window.clearTimeout(t);
  }, []);
  const [hoverStage, setHoverStage] = useState<string | null>(null);
  const [hoverZone, setHoverZone] = useState<"won" | "lost" | null>(null);
  // Drag-over is tracked per target with a short grace on leave: HTML5 fires
  // dragleave on the column whenever the pointer crosses into one of its own
  // children (the drop slot, a card, the empty button), and clearing on that
  // swapped "Drop to move" back to "No leads here" in a loop (David 2026-11-24:
  // "it starts spazzing out"). A leave into a descendant is ignored; any other
  // leave waits a beat and is cancelled by the next dragover.
  const leaveTimer = useRef<number | null>(null);
  const cancelLeave = () => {
    if (leaveTimer.current !== null) {
      window.clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  };
  const leaveSoon = (clear: () => void) => {
    cancelLeave();
    leaveTimer.current = window.setTimeout(() => {
      leaveTimer.current = null;
      clear();
    }, 80);
  };
  useEffect(() => cancelLeave, []);
  const leftForChild = (e: React.DragEvent) => {
    const to = e.relatedTarget as Node | null;
    return !!to && e.currentTarget.contains(to);
  };
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
      if (source && c.leadSource !== source) return false;
      if (staleOnly && (staleLevel(c) === null || stages.find((st) => st.id === c.stageId)?.isConverted)) return false;
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
  }, [board, query, assignee, source, staleOnly, stages]);

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
        hidePeek();
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        setDragId(card.id);
      },
      onDragEnd: () => {
        cancelLeave();
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
        cancelLeave();
        setHoverStage((cur) => (cur === stageId ? cur : stageId));
      },
      onDragLeave: (e: React.DragEvent) => {
        if (leftForChild(e)) return;
        leaveSoon(() => setHoverStage((cur) => (cur === stageId ? null : cur)));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        cancelLeave();
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
        cancelLeave();
        setHoverZone((cur) => (cur === zone ? cur : zone));
      },
      onDragLeave: (e: React.DragEvent) => {
        if (leftForChild(e)) return;
        leaveSoon(() => setHoverZone((cur) => (cur === zone ? null : cur)));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        cancelLeave();
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
  const staleCount = working.filter((c) => staleLevel(c) !== null).length;
  const workingStages = stages.filter((s) => !s.isConverted);
  const lost30 = lost.filter((l) => l.lostAt && Date.now() - new Date(l.lostAt).getTime() < 30 * 86_400_000);

  // Reach between adjacent stages, from today's board: of the leads at this
  // stage or later (wins in the last 30 days count as later), the share that
  // have reached the next one. A snapshot, not history — said so in the tip.
  const reach = useMemo(() => {
    const order = new Map(workingStages.map((s, i) => [s.id, i]));
    const atOrPast = workingStages.map(() => 0);
    for (const c of board) {
      const i = c.stageId === convertedStageId ? workingStages.length : order.get(c.stageId);
      if (i === undefined) continue;
      for (let k = 0; k <= Math.min(i, workingStages.length - 1); k++) atOrPast[k]++;
    }
    const wins = won30;
    return workingStages.map((_, i) => {
      const here = atOrPast[i] + wins;
      const next = i + 1 < workingStages.length ? atOrPast[i + 1] + wins : wins;
      return here > 0 ? Math.round((next / here) * 100) : null;
    });
  }, [board, workingStages, convertedStageId, won30]);

  // Keyboard: arrows walk the board, Enter opens, Shift+←/→ moves the card a stage
  function onCardKey(e: React.KeyboardEvent, card: BoardCard, col: number, row: number) {
    const go = (c: number, r: number) => {
      const el = document.querySelector<HTMLElement>(`[data-lead-col="${c}"][data-lead-row="${r}"]`) ??
        document.querySelector<HTMLElement>(`[data-lead-col="${c}"][data-lead-last]`);
      if (el) {
        e.preventDefault();
        el.focus();
      }
    };
    if (e.key === "Enter") {
      e.preventDefault();
      onCardClick(card);
    } else if (e.key === "ArrowDown") go(col, row + 1);
    else if (e.key === "ArrowUp" && row > 0) go(col, row - 1);
    else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && e.shiftKey) {
      const i = workingStages.findIndex((s) => s.id === card.stageId);
      const to = workingStages[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (i >= 0 && to) {
        e.preventDefault();
        void moveCard(card, to.id);
      }
    } else if (e.key === "ArrowRight") go(col + 1, row);
    else if (e.key === "ArrowLeft" && col > 0) go(col - 1, row);
  }

  function showPeek(card: BoardCard, el: HTMLElement) {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    if (dragId || (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches)) return;
    peekTimer.current = setTimeout(() => {
      const r = el.getBoundingClientRect();
      const right = r.right + 296 < window.innerWidth;
      setPeek({ card, x: right ? r.right + 8 : r.left - 288, y: Math.min(r.top, window.innerHeight - 300) });
    }, 450);
  }
  function hidePeek() {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setPeek(null);
  }

  return (
    <div className="ld rx-leads p-4 lg:p-8 h-full flex flex-col">
      {/* Header: the board in one exact sentence */}
      <div className="flex flex-wrap items-end justify-between gap-y-3 mb-4 max-w-none">
        <div className="min-w-0">
          <PageTitle heavy section="leads" icon={SquareKanban}>
            Leads
          </PageTitle>
          <p className="ld-lede">
            {totalValue > 0 ? (
              <>
                <b className="ld-lede-money">{money(totalValue)}</b> open across <b>{working.length}</b> {working.length === 1 ? "lead" : "leads"}
              </>
            ) : (
              <>
                <b>{working.length}</b> {working.length === 1 ? "lead" : "leads"} on the board
              </>
            )}
            {staleCount > 0 && (
              <>
                {" · "}
                <button type="button" className="ld-lede-stale" onClick={() => setStaleOnly((v) => !v)} aria-pressed={staleOnly}>
                  {staleCount} going stale
                </button>
              </>
            )}
            {won30 > 0 && <> · <b className="ld-lede-won">{won30}</b> won in 30 days</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowLost(true)}
            className="ld-btn"
            title="Leads marked lost or archived"
          >
            <Archive size={15} />
            <span>
              Lost &amp; archived{lost.length > 0 && <span className="ml-1 text-[color:var(--ds-faint)] numeral-ledger">{lost.length}</span>}
            </span>
          </button>
          {manager && (
            <Link href="/app/settings/pipeline" className="ld-btn">
              <Settings2 size={15} />
              <span className="hidden sm:inline">Customize board</span>
            </Link>
          )}
          <button
            onClick={() => setAddingTo(stages[0]?.id ?? null)}
            className="btn-primary"
          >
            <Plus size={15} />
            New lead
          </button>
        </div>
      </div>

      {/* Filter bar: search, owner, source, stale only, sort */}
      <div className="ld-bar mb-3">
        <label className="ld-search">
          <Search size={14} aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, address, custom fields…"
          />
        </label>
        {manager && team.length > 1 && (
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className="ld-select" aria-label="Owner">
            <option value="">Everyone</option>
            {team.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {sources.length > 0 && (
          <select value={source} onChange={(e) => setSource(e.target.value)} className="ld-select" aria-label="Source">
            <option value="">Any source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => setStaleOnly((v) => !v)} aria-pressed={staleOnly} className="ld-toggle">
          <span className="ld-toggle-dot" aria-hidden />
          Stale only
        </button>
        <span className="ld-bar-gap" />
        <label className="ld-sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as LeadSort)} className="ld-select" aria-label="Sort cards">
            <option value="board">Board order</option>
            <option value="value">Value</option>
            <option value="age">Days in stage</option>
            <option value="newest">Newest</option>
          </select>
        </label>
        <span className="ld-keys hidden xl:inline" title="Arrow keys move between cards · Enter opens · Shift + ← / → moves a card a stage">
          ↑↓←→ · ⏎ · ⇧←→ moves
        </span>
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
              Add a lead
            </button>
          )}
          </EmptyState>
        </div>
      ) : (
        // Horizontal scroller — the scrollbar stays VISIBLE (app-ui slim
        // style): with it hidden, desktop mouse users had no way to reach
        // off-screen stages. Touch swipes; desktop gets the bar + shift-wheel.
        <BoardScroller className={`ld-board ${live ? "is-live" : ""} ${dragId ? "is-dragging" : ""} flex-1 flex gap-3 overflow-x-auto pb-24 lg:pb-4 items-stretch snap-x snap-mandatory lg:snap-none -mx-4 px-4 lg:mx-0 lg:px-0`}>
          {stages.map((stage, col) => {
            const columnCards = sortCards(byStage.get(stage.id) ?? []);
            const columnValue = columnCards.reduce((s, c) => s + c.value, 0);
            const count = columnCards.length + (stage.isConverted ? convertedOverflow : 0);
            const share = totalValue > 0 && !stage.isConverted ? columnValue / totalValue : 0;
            const wi = workingStages.findIndex((s) => s.id === stage.id);
            const rate = wi >= 0 ? reach[wi] : null;
            const isCollapsed = collapsed.includes(stage.id);
            const dropping = hoverStage === stage.id && dragId !== null && board.find((c) => c.id === dragId)?.stageId !== stage.id;
            if (isCollapsed) {
              return (
                <button
                  key={stage.id}
                  type="button"
                  {...dropProps(stage.id)}
                  onClick={() => toggleCollapsed(stage.id)}
                  className={`ld-col has-stage is-collapsed ${dropping ? "is-drop" : ""}`}
                  style={themedBgVars(stage.color)}
                  aria-label={`Show ${stage.name} (${count})`}
                  title={`Show ${stage.name}`}
                >
                  <span className="ld-dot bg-themed" style={themedBgVars(stage.color)} aria-hidden />
                  <span className="ld-col-vert">{stage.name}</span>
                  <span className="ld-col-count">{count}</span>
                </button>
              );
            }
            return (
              <section
                key={stage.id}
                className={`ld-col has-stage w-[82vw] sm:w-80 lg:w-[288px] shrink-0 snap-center lg:snap-align-none ${dropping ? "is-drop" : ""}`}
                style={themedBgVars(stage.color)}
                aria-label={stage.name}
              >
                {/* Column header: name, count, value, the stage's share of the pipeline, reach to the next stage */}
                <header className="ld-col-head">
                  <div className="ld-col-row">
                    <span className="ld-dot bg-themed" style={themedBgVars(stage.color)} aria-hidden />
                    <span className="ld-col-name">
                      {stage.isConverted && <Trophy size={12} className="shrink-0" aria-hidden />}
                      {stage.name}
                    </span>
                    <span className="ld-col-count">{count}</span>
                    <span className="ml-auto flex items-center">
                      {!stage.isConverted && (
                        <button
                          onClick={() => setAddingTo(stage.id)}
                          className="ld-icon-btn"
                          aria-label={`Add lead to ${stage.name}`}
                          title={`Add lead to ${stage.name}`}
                        >
                          <Plus size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(stage.id)}
                        className="ld-icon-btn"
                        aria-label={`Collapse ${stage.name}`}
                        title="Collapse"
                      >
                        <ChevronsLeft size={14} />
                      </button>
                    </span>
                  </div>
                  <div className="ld-col-row is-sub">
                    {stage.isConverted ? (
                      <span>{won30} won in the last 30 days</span>
                    ) : (
                      <>
                        <span className="ld-col-value">{money(columnValue)}</span>
                        {rate !== null && (
                          <span className="ld-col-reach" title="Of the leads at this stage or later (plus wins in the last 30 days), how many have reached the next stage. From today's board.">
                            → {rate}%
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {!stage.isConverted && (
                    <span className="ld-share" aria-hidden>
                      <span className="bg-themed" style={{ ...themedBgVars(stage.color), width: `${Math.round(share * 100)}%` }} />
                    </span>
                  )}
                </header>

                {/* Column body (drop target) */}
                <div {...dropProps(stage.id)} className="ld-col-body">
                  {dropping && <div className="ld-slot" aria-hidden>Drop to move to {stage.name}</div>}
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
                  {columnCards.map((card, row) => {
                    const stale = stage.isConverted ? null : staleLevel(card);
                    const next = nextLine(card);
                    return (
                      <div
                        key={card.id}
                        {...dragProps(card)}
                        tabIndex={0}
                        data-lead-col={col}
                        data-lead-row={row}
                        {...(row === columnCards.length - 1 ? { "data-lead-last": "" } : {})}
                        onKeyDown={(e) => onCardKey(e, card, col, row)}
                        onClick={() => onCardClick(card)}
                        onMouseEnter={(e) => showPeek(card, e.currentTarget)}
                        onMouseLeave={hidePeek}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          hidePeek();
                          setMenu({ card, anchor: { x: e.clientX, y: e.clientY } });
                        }}
                        className={`ld-card ${stale ? `is-${stale}` : ""} ${dragId === card.id ? "is-dragging" : ""}`}
                        aria-label={`${card.name}${card.value > 0 ? `, ${money(card.value)}` : ""}, ${daysWord(card.stageChangedAt)} in ${stage.name}`}
                      >
                        <div className="ld-card-row">
                          <p className="ld-card-name">{card.name}</p>
                          <span className="ld-card-value">{card.value > 0 ? money(card.value) : ""}</span>
                        </div>
                        <p className="ld-card-meta">
                          {card.repeat && <span className="ld-card-repeat" title="Has worked with you before">Repeat · </span>}
                          {[card.companyName, card.leadSource].filter(Boolean).join(" · ") || " "}
                        </p>
                        <div className="ld-card-foot">
                          <span className={`ld-card-next ${next.tone ? `is-${next.tone}` : ""}`} title={next.title}>
                            {next.kind === "appointment" ? <CalendarClock size={12} aria-hidden /> : next.kind === "task" ? <ListChecks size={12} aria-hidden /> : null}
                            <span className="truncate">{next.text}</span>
                          </span>
                          <span className={`ld-card-age ${stale ? `is-${stale}` : ""}`} title={`In ${stage.name} since ${new Date(card.stageChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}>
                            {daysIn(card.stageChangedAt)}
                          </span>
                          {card.assignedTo ? (
                            <span className="ld-card-owner" title={`Assigned to ${card.assignedTo.name}`} style={{ background: monogramColor(card.assignedTo.name) }}>
                              {initials(card.assignedTo.name)}
                            </span>
                          ) : (
                            <span className="ld-card-owner is-none" title="No one assigned" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {columnCards.length === 0 && addingTo !== stage.id && !dropping && (
                    stage.isConverted ? (
                      <div className="ld-empty">Wins land here — they become clients</div>
                    ) : (
                      <button type="button" className="ld-empty is-add" onClick={() => setAddingTo(stage.id)}>
                        No leads here · <span>Add one</span>
                      </button>
                    )
                  )}
                  {stage.isConverted && convertedOverflow > 0 && (
                    <Link href="/app/contacts" className="ld-more">
                      +{convertedOverflow} more — see Clients
                    </Link>
                  )}
                </div>
              </section>
            );
          })}

          {/* The tail: Lost as a collapsed summary column — a drop target too; opens the list */}
          <button
            type="button"
            {...zoneProps("lost")}
            onClick={() => setShowLost(true)}
            className={`ld-col is-collapsed is-tail ${hoverZone === "lost" && dragId ? "is-drop" : ""}`}
            title="Lost & archived leads"
            aria-label={`Lost: ${lost30.length} in the last 30 days`}
          >
            <XCircle size={14} className="text-[color:var(--ds-muted)]" aria-hidden />
            <span className="ld-col-vert">Lost · 30 days</span>
            <span className="ld-col-count">{lost30.length}</span>
          </button>
        </BoardScroller>
      )}

      {/* Hover peek: the full card */}
      {peek && !dragId && (
        <div className="ld-peek" style={{ left: peek.x, top: peek.y }} role="tooltip">
          <p className="ld-peek-name">{peek.card.name}</p>
          {peek.card.companyName && <p className="ld-peek-sub">{peek.card.companyName}</p>}
          <dl className="ld-peek-grid">
            <dt>Value</dt>
            <dd>{peek.card.value > 0 ? money(peek.card.value) : "No open quote"}</dd>
            <dt>In stage</dt>
            <dd>{daysWord(peek.card.stageChangedAt)}</dd>
            <dt>Next</dt>
            <dd>{nextLine(peek.card).title}</dd>
            <dt>Owner</dt>
            <dd>{peek.card.assignedTo?.name ?? "No one"}</dd>
            <dt>Source</dt>
            <dd>{peek.card.leadSource ?? "Not set"}</dd>
            {peek.card.phone && (
              <>
                <dt>Phone</dt>
                <dd>{peek.card.phone}</dd>
              </>
            )}
            {peek.card.email && (
              <>
                <dt>Email</dt>
                <dd className="truncate">{peek.card.email}</dd>
              </>
            )}
            <dt>Activity</dt>
            <dd>
              {peek.card.counts.requests} {peek.card.counts.requests === 1 ? "request" : "requests"} · {peek.card.counts.quotes} {peek.card.counts.quotes === 1 ? "quote" : "quotes"} · {peek.card.counts.appointments} booked
            </dd>
            <dt>Added</dt>
            <dd>{new Date(peek.card.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd>
          </dl>
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
            <span>Lost &amp; archived leads</span>
            <InfoTip>Restore puts them back in the first stage. Lost leads also sit under Clients → Lost leads, archived ones under Clients → Archived.</InfoTip>
          </h2>
          <button type="button" onClick={() => setShowLost(false)} className="rounded-full p-1.5 text-[color:var(--ds-faint)] hover:bg-[color:var(--ds-surface-2)] hover:text-[color:var(--ds-ink-2)]" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {lost.length === 0 ? (
          <p className="py-8 text-center text-sm text-[color:var(--ds-muted)]">Nothing here yet. Drop a card on Lost, use its menu, or archive a lead, and it lands here.</p>
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
                    {l.lostAt ? "Lost " : "Archived "}
                    {new Date(l.offAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
                Mark lost
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
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => setName((n) => titleCaseName(n))}
        placeholder="Name"
        autoFocus
        className={box}
      />
      <input
        value={contact}
        // A number formats itself as it's typed; an email is left alone
        onChange={(e) => setContact(more || looksLikePhone(e.target.value) ? formatPhoneAsTyped(e.target.value) : e.target.value)}
        placeholder={more ? "Phone (optional)" : "Phone or email (optional)"}
        type={more ? "tel" : "text"}
        className={box}
      />
      {more ? (
        <>
          <input value={extra.email} onChange={(e) => setX("email", e.target.value)} placeholder="Email (optional)" type="email" className={box} />
          <input value={extra.companyName} onChange={(e) => setX("companyName", e.target.value)} placeholder="Company (optional)" className={box} />
          <AddressAutocomplete
            endpoint="/api/app/geocode/suggest"
            value={extra.address}
            onChange={(v) => setX("address", v)}
            onPick={(a) => setExtra((x) => ({ ...x, address: a.street, city: a.city, state: a.state, zip: a.postalCode }))}
            placeholder="Street address"
            className={box}
          />
          <UseMyLocation
            size="xs"
            onFill={(a) => setExtra((x) => ({ ...x, address: a.street, city: a.city, state: a.state, zip: a.postalCode }))}
          />
          <div className="grid grid-cols-[1fr_3.5rem_4.5rem] gap-1.5">
            <input value={extra.city} onChange={(e) => setX("city", e.target.value)} placeholder="City" className={box} />
            <input value={extra.state} onChange={(e) => setX("state", e.target.value.slice(0, 2))} placeholder="ST" aria-label="State" className={box} />
            <input value={extra.zip} onChange={(e) => setX("zip", e.target.value.slice(0, 10))} placeholder="ZIP" inputMode="numeric" className={box} />
          </div>
          <LeadSourceField value={extra.leadSource} onChange={(v) => setX("leadSource", v)} className={box} emptyLabel="Lead source" />
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
