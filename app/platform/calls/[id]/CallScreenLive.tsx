"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Grid3x3, Mic, MicOff, Pause, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Play, StickyNote, UserPlus, Voicemail, Volume2, X, type LucideIcon } from "lucide-react";
import StickyEditor from "@/components/sticky/StickyEditor";
import { fmtElapsed, softphone, useSoftphone } from "@/lib/softphone-client";
import { endingLabel } from "@/lib/call-ending";
import { participantWord } from "@/lib/voice-conference";
import type { CallPeopleView, ParticipantView } from "@/lib/voice";
import DialPad from "@/components/DialPad";
import Monogram from "@/components/Monogram";
import { MicRow, MicWarning } from "@/components/MicControls";
import CallFromLineButton from "@/components/CallFromLineButton";
import VoicemailPlayer from "@/components/VoicemailPlayer";
import AddPersonSheet from "./AddPersonSheet";

/**
 * The top of the call screen: who, and what's happening right now. When
 * the softphone in this tab is on THIS call, the card is the phone — the
 * iOS call face: avatar, name, the timer, a grid of labelled round controls
 * (mute, hold, speaker on an iPhone, keypad, note, Add a person) and the
 * red button under them (Hang up — or Leave once someone else is on the
 * call with the customer, with End for everyone behind a second tap; or
 * Decline / Answer while it rings). Otherwise it reports the row: ringing
 * the cell, on the cell with a running timer, or how it ended — and offers
 * Call back. A live row is polled so the screen turns over the moment the
 * call ends, and the page re-renders (durations, "On this call") when the
 * browser call closes.
 *
 * People added to the call (lib/voice-conference.ts) ride the same poll:
 * the strip under the status line shows each one ringing / on the call,
 * with a mute toggle and an ✕, and "Add" opens ./AddPersonSheet.tsx.
 */

type Status = "RINGING" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "VOICEMAIL" | "NO_ANSWER" | "FAILED";
const LIVE = new Set<Status>(["RINGING", "IN_PROGRESS"]);
const LIVE_POLL_MS = 2500;
/** How long a chip that rang out / was removed stays on the strip. */
const CHIP_LINGER_MS = 6000;

const fmtSecs = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** One labelled round control — the iOS call-face button. */
function Control({
  icon: Icon,
  label,
  onClick,
  on = false,
  disabled = false,
  tone = "neutral",
  size = "md",
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Lit = the thing is on (muted, on hold, speaker, keypad open). */
  on?: boolean;
  disabled?: boolean;
  tone?: "neutral" | "green" | "red";
  size?: "md" | "lg";
  title?: string;
}) {
  const face =
    tone === "green"
      ? "bg-[color:var(--ds-good)] text-[color:var(--ds-surface)] hover:opacity-90"
      : tone === "red"
        ? "bg-[color:var(--ds-bad)] text-[color:var(--ds-surface)] hover:opacity-90"
        : on
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-800 hover:bg-gray-200";
  const dim = size === "lg" ? "h-[68px] w-[68px]" : "h-[60px] w-[60px]";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title ?? label} aria-label={label} aria-pressed={tone === "neutral" ? on : undefined} className="flex flex-col items-center gap-1.5 disabled:opacity-50">
      <span className={`flex ${dim} items-center justify-center rounded-full transition-[background-color,transform] duration-100 active:scale-95 ${face}`}>
        <Icon size={size === "lg" ? 26 : 22} />
      </span>
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
    </button>
  );
}

const firstName = (label: string) => label.split(" ")[0] || label;

/** The people added to the call: one chip each, ringing → on the call → gone. */
function PeopleStrip({
  people,
  now,
  canAct,
  muted,
  onMute,
  onRemove,
}: {
  people: CallPeopleView;
  now: number;
  /** The viewer is on the call (or runs the company): show the mute and ✕ controls. */
  canAct: boolean;
  muted: Set<string>;
  onMute: (p: ParticipantView, mute: boolean) => void;
  onRemove: (p: ParticipantView) => void;
}) {
  const shown = people.participants.filter((p) => {
    if (p.status === "ringing" || p.status === "joined") return true;
    const left = p.leftAt ? Date.parse(p.leftAt) : 0;
    return left > 0 && now - left < CHIP_LINGER_MS;
  });
  if (shown.length === 0) return null;
  return (
    <ul className="mx-auto mt-4 flex max-w-sm flex-wrap items-center justify-center gap-2" aria-label="Also on the call">
      {shown.map((p) => {
        const on = p.status === "joined";
        const ringing = p.status === "ringing";
        const isMuted = muted.has(p.id);
        const word = on && p.joinedAt ? fmtElapsed(Date.parse(p.joinedAt), now) : participantWord(p.status);
        const ink = ringing ? "text-[color:var(--ds-warn)]" : on ? "text-gray-500" : p.status === "left" ? "text-gray-400" : "text-[color:var(--ds-bad)]";
        return (
          <li
            key={p.id}
            className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-1.5 text-[12.5px] ${ringing ? "bg-[color:var(--ds-warn-soft)] animate-pulse" : on ? "bg-gray-100" : "bg-gray-50"}`}
          >
            <Monogram name={p.label} size={22} />
            <span className="max-w-[9rem] truncate font-medium text-gray-800">{firstName(p.label)}</span>
            <span className={`numeral-ledger tabular-nums ${ink}`}>{word}</span>
            {canAct && on && (
              <button
                type="button"
                onClick={() => onMute(p, !isMuted)}
                aria-pressed={isMuted}
                aria-label={isMuted ? `Unmute ${firstName(p.label)}` : `Mute ${firstName(p.label)}`}
                title={isMuted ? "Unmute them" : "Mute them"}
                className={`flex h-6 w-6 items-center justify-center rounded-full ${isMuted ? "bg-gray-900 text-white" : "text-gray-500 hover:bg-gray-200"}`}
              >
                {isMuted ? <MicOff size={12} /> : <Mic size={12} />}
              </button>
            )}
            {canAct && (on || ringing) && (
              <button
                type="button"
                onClick={() => onRemove(p)}
                aria-label={ringing ? `Stop ringing ${firstName(p.label)}` : `Remove ${firstName(p.label)} from the call`}
                title={ringing ? "Stop ringing them" : "Remove them from the call"}
                className="flex h-6 w-6 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800"
              >
                <X size={12} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function CallScreenLive({
  callId,
  direction,
  status,
  label,
  standing,
  number,
  customerNumber,
  contactId,
  answeredAt,
  durationSec,
  endedBy,
  voicemailSec,
  voicemailRecordingId,
  who,
  placedAt,
  canCall,
  via,
  initialPeople,
}: {
  callId: string;
  direction: "INBOUND" | "OUTBOUND";
  status: Status;
  /** "app" = placed/answered in a browser, "cell" = the owner's phone rang, null = not decided yet. */
  via: "app" | "cell" | null;
  /** Name, or the formatted number when there is no contact. */
  label: string;
  /** "lead" / "client" / "". */
  standing: string;
  /** Formatted number to show under a name; "" when the label already is the number. */
  number: string;
  customerNumber: string;
  contactId: string | null;
  answeredAt: string | null;
  durationSec: number | null;
  /** Who ended a connected call: "them" | "us" | "network" (lib/call-ending.ts); null on older rows. */
  endedBy: string | null;
  voicemailSec: number | null;
  voicemailRecordingId: string | null;
  who: string;
  placedAt: string;
  canCall: boolean;
  /** Who else is on the call as of the page load (lib/voice.ts callPeopleView); polled afterwards. */
  initialPeople: CallPeopleView;
}) {
  const router = useRouter();
  const sp = useSoftphone();
  const live = sp.call && sp.call.callId === callId ? sp.call : null;
  const [row, setRow] = useState({ status, answeredAt });
  const [people, setPeople] = useState<CallPeopleView>(initialPeople);
  const [pad, setPad] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [muted, setMuted] = useState<Set<string>>(() => new Set());
  const [peopleError, setPeopleError] = useState("");
  /** "End for everyone" asks for a second tap within a few seconds. */
  const [confirmEnd, setConfirmEnd] = useState(false);
  const wasLive = useRef(false);
  /** The browser call on this screen just ended; the row still says RINGING/IN_PROGRESS until its webhook lands. */
  const [ended, setEnded] = useState(false);
  // The call card scrolled out of view — a long page, or the keyboard up on
  // a phone while saving the caller — so a slim bar pinned to the top keeps
  // End and Mute within reach (2026-10-30 report: "End is off the screen").
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardOff, setCardOff] = useState(false);

  const rowLive = LIVE.has(row.status);

  // One poll while anything is live: the row (status, so the screen turns
  // over the moment the call ends) and who else is on it (the strip).
  useEffect(() => {
    if (!live && !rowLive) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/app/line/softphone/call?id=${encodeURIComponent(callId)}`, { cache: "no-store" });
        const j = (await res.json()) as { call?: { status: Status; answeredAt: string | null; people?: CallPeopleView } | null };
        if (stop || !j.call) return;
        if (j.call.people) setPeople(j.call.people);
        if (j.call.status !== row.status || j.call.answeredAt !== row.answeredAt) {
          setRow({ status: j.call.status, answeredAt: j.call.answeredAt });
          if (!LIVE.has(j.call.status)) router.refresh();
        }
      } catch {
        /* next tick */
      }
    };
    const t = setInterval(tick, LIVE_POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [live, rowLive, row.status, row.answeredAt, callId, router]);

  // The browser call on this screen just ended: pull the finished row (duration, what got done).
  useEffect(() => {
    if (live) {
      wasLive.current = true;
      return;
    }
    if (!wasLive.current) return;
    wasLive.current = false;
    setPad(false);
    setAddOpen(false);
    setEnded(true);
    router.refresh();
    const t = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(t);
  }, [live, router]);

  // The floating card's Add button lands here with ?add=1: open the sheet.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("add") === "1") {
        setAddOpen(true);
        window.history.replaceState(null, "", window.location.pathname);
      }
    } catch {
      /* no window */
    }
  }, []);

  useEffect(() => {
    if (!confirmEnd) return;
    const t = setTimeout(() => setConfirmEnd(false), 4000);
    return () => clearTimeout(t);
  }, [confirmEnd]);

  // Watch the card while this tab is on the call (not while it rings).
  const pinnable = Boolean(live) && live?.state !== "ringing";
  useEffect(() => {
    const el = cardRef.current;
    if (!pinnable || !el || typeof IntersectionObserver === "undefined") {
      setCardOff(false);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setCardOff(!entry.isIntersecting), { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [pinnable]);

  useEffect(() => {
    if (!peopleError) return;
    const t = setTimeout(() => setPeopleError(""), 5000);
    return () => clearTimeout(t);
  }, [peopleError]);

  const onLine = live ? live.state === "active" || live.state === "held" : row.status === "IN_PROGRESS";
  const now = useNow(onLine || rowLive);
  const ringing = live?.state === "ringing";
  const dialing = live?.state === "dialing";
  const held = live?.state === "held";
  const onCallHere = Boolean(live && onLine);
  const leaveMode = people.redButton === "leave";

  const refreshPeople = useCallback(async () => {
    try {
      const res = await fetch(`/api/app/line/softphone/call?id=${encodeURIComponent(callId)}`, { cache: "no-store" });
      const j = (await res.json()) as { call?: { people?: CallPeopleView } | null };
      if (j.call?.people) setPeople(j.call.people);
    } catch {
      /* the poll catches up */
    }
  }, [callId]);

  const peopleRequest = useCallback(
    async (method: "PATCH" | "DELETE", body: Record<string, unknown>) => {
      try {
        const res = await fetch("/api/app/line/call/participants", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId, ...body }) });
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(j.error || "Something went wrong.");
        return true;
      } catch (err) {
        setPeopleError(err instanceof Error ? err.message : "Something went wrong.");
        return false;
      }
    },
    [callId]
  );

  const muteParticipant = async (p: ParticipantView, mute: boolean) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (mute) next.add(p.id);
      else next.delete(p.id);
      return next;
    });
    const ok = await peopleRequest("PATCH", { participantId: p.id, mute });
    if (!ok) {
      setMuted((prev) => {
        const next = new Set(prev);
        if (mute) next.delete(p.id);
        else next.add(p.id);
        return next;
      });
    }
  };

  const removeParticipant = async (p: ParticipantView) => {
    if (await peopleRequest("DELETE", { participantId: p.id })) await refreshPeople();
  };

  /** Leave: only this leg drops; the others go on (the server hands the call to a joined teammate if the answerer leaves). */
  const leave = async () => {
    await fetch("/api/app/line/call/leave", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: callId }) }).catch(() => {});
    softphone.hangup();
  };

  const endForEveryone = async () => {
    if (!confirmEnd) {
      setConfirmEnd(true);
      return;
    }
    setConfirmEnd(false);
    await fetch(`/api/app/line/call?id=${encodeURIComponent(callId)}&all=1`, { method: "DELETE" }).catch(() => {});
    softphone.hangup();
  };

  // The one line under the name.
  let line: string;
  let tone = "text-gray-500";
  if (live) {
    if (ringing) line = live.invite ? live.invite : "Calling your business line";
    else if (dialing) line = "Calling from your business line…";
    else if (held) line = `On hold · ${fmtElapsed(live.startedAt, now)}`;
    else line = fmtElapsed(live.startedAt, now);
    tone = ringing ? "text-[color:var(--ds-good)]" : "text-gray-700";
  } else if (ended && LIVE.has(row.status)) {
    // Hung up here a moment ago; the row catches up on the next poll. Never
    // "ringing your cell" — nothing is ringing anything.
    line = "Call ended";
  } else {
    switch (row.status) {
      case "RINGING":
        line = direction === "INBOUND" ? "Ringing…" : via === "app" ? "Calling from the app…" : "Ringing your cell first…";
        tone = "text-[color:var(--ds-warn)]";
        break;
      case "IN_PROGRESS":
        line = `On the line${who ? ` · ${who}` : ""} · ${fmtElapsed(row.answeredAt ? Date.parse(row.answeredAt) : null, now)}`;
        tone = "text-[color:var(--ds-good)]";
        break;
      case "COMPLETED": {
        const ending = endingLabel(endedBy);
        line = `Answered${durationSec !== null ? ` · ${fmtSecs(durationSec)}` : ""}${who ? ` · ${who}` : ""}${ending ? ` · ${ending}` : ""}`;
        break;
      }
      case "MISSED":
        line = "Missed";
        tone = "text-[color:var(--ds-bad)]";
        break;
      case "VOICEMAIL":
        line = `Left a voicemail${voicemailSec !== null ? ` · ${fmtSecs(voicemailSec)}` : ""}`;
        tone = "text-[color:var(--ds-primary)]";
        break;
      case "NO_ANSWER":
        line = "No answer";
        break;
      default:
        line = "Didn't connect";
    }
  }

  const terminal = !live && !LIVE.has(row.status);
  const Icon = live
    ? ringing
      ? PhoneIncoming
      : Phone
    : row.status === "VOICEMAIL"
      ? Voicemail
      : row.status === "MISSED"
        ? PhoneMissed
        : direction === "INBOUND"
          ? PhoneIncoming
          : PhoneOutgoing;
  const ring = live
    ? ringing
      ? "bg-[color:var(--ds-good-soft)] text-[color:var(--ds-good)] ring-8 ring-[color:var(--ds-good-soft)] animate-pulse"
      : dialing
        ? "bg-gray-100 text-gray-700 ring-8 ring-gray-100 animate-pulse"
        : "bg-[color:var(--ds-good)] text-[color:var(--ds-surface)] ring-8 ring-[color:var(--ds-good-soft)]"
    : ended && LIVE.has(row.status)
      ? "bg-gray-100 text-gray-600"
      : row.status === "IN_PROGRESS"
        ? "bg-[color:var(--ds-good)] text-[color:var(--ds-surface)] ring-8 ring-[color:var(--ds-good-soft)]"
        : row.status === "RINGING"
          ? "bg-[color:var(--ds-warn-soft)] text-[color:var(--ds-warn)] ring-8 ring-[color:var(--ds-warn-soft)] animate-pulse"
          : "bg-gray-100 text-gray-600";
  // A saved caller shows as their monogram; the same halo as the icon face while the call is live.
  const halo = live
    ? ringing
      ? "ring-8 ring-[color:var(--ds-good-soft)] animate-pulse"
      : dialing
        ? "ring-8 ring-gray-100 animate-pulse"
        : "ring-8 ring-[color:var(--ds-good-soft)]"
    : !(ended && LIVE.has(row.status)) && row.status === "IN_PROGRESS"
      ? "ring-8 ring-[color:var(--ds-good-soft)]"
      : !(ended && LIVE.has(row.status)) && row.status === "RINGING"
        ? "ring-8 ring-[color:var(--ds-warn-soft)] animate-pulse"
        : "";
  const face = contactId ? (
    <span className={`mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full ${halo}`}>
      <Monogram name={label} size={76} />
    </span>
  ) : (
    <span className={`mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full ${ring}`}>
      <Icon size={30} />
    </span>
  );
  // The strip and its controls: while the call is live anywhere (the server decides who may act).
  const showStrip = (live && !ringing && !dialing) || (!live && !ended && row.status === "IN_PROGRESS");

  return (
    <div ref={cardRef} className="ds-card mt-3 px-5 pb-6 pt-8 text-center sm:px-8">
      {live && !ringing && cardOff && typeof document !== "undefined" &&
        createPortal(
          <div
            role="status"
            aria-label="On a call"
            className="fixed inset-x-0 z-[70] flex items-center gap-3 border-b border-[color:var(--ds-line)] bg-[color:var(--ds-surface)] px-4 py-2 shadow-sm"
            style={{ top: "env(safe-area-inset-top, 0px)" }}
          >
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${held ? "bg-[color:var(--ds-warn)]" : "animate-pulse bg-[color:var(--ds-good)]"}`} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[color:var(--ds-ink)]">
              {label}
              <span className="numeral-ledger ml-2 tabular-nums text-[color:var(--ds-muted)]">{dialing ? "Calling…" : held ? "On hold" : fmtElapsed(live.startedAt, now)}</span>
            </span>
            <button
              type="button"
              onClick={() => softphone.toggleMute()}
              disabled={dialing}
              aria-pressed={live.muted}
              aria-label={live.muted ? "Unmute" : "Mute"}
              className={`flex h-9 w-9 items-center justify-center rounded-full ${live.muted ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-800"}`}
            >
              {live.muted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              type="button"
              onClick={() => (leaveMode && !dialing ? void leave() : softphone.hangup())}
              aria-label={dialing ? "Cancel" : leaveMode ? "Leave" : "End"}
              className="flex h-9 items-center gap-1.5 rounded-full bg-[color:var(--ds-bad)] px-3.5 text-sm font-semibold text-white active:scale-95"
            >
              <PhoneOff size={15} /> {dialing ? "Cancel" : leaveMode ? "Leave" : "End"}
            </button>
          </div>,
          document.body
        )}
      {face}
      <h1 className="mt-4 truncate text-[26px] font-semibold leading-tight text-gray-900">
        {contactId ? (
          <Link href={`/app/contacts/${contactId}`} className="hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </h1>
      <p className="numeral-ledger mt-1 text-sm text-gray-500">
        {standing && <span className="font-sans">{standing}</span>}
        {standing && number && " · "}
        {number}
      </p>
      <p className={`mt-2 text-[15px] ${tone} ${live && onLine ? "numeral-ledger text-lg tabular-nums" : ""}`}>
        {line}
        {!(live && onLine) && <span className="text-gray-400"> · {placedAt}</span>}
      </p>

      {showStrip && <PeopleStrip people={people} now={now} canAct={onCallHere || people.me !== null || !live} muted={muted} onMute={muteParticipant} onRemove={removeParticipant} />}
      {peopleError && (
        <p className="mt-2 text-[13px] text-red-600" role="alert">
          {peopleError}
        </p>
      )}

      {live && ringing && (
        <div className="mt-7 flex items-start justify-center gap-10">
          <Control icon={PhoneOff} label="Decline" tone="red" size="lg" onClick={() => softphone.decline()} title={live.invite ? "Decline — they stay on their call without you" : "Decline — sends the call on to the cell / voicemail"} />
          <Control icon={Phone} label={live.invite ? "Join" : "Answer"} tone="green" size="lg" onClick={() => softphone.answer()} />
        </div>
      )}
      {live && !ringing && (
        <>
          <div className="mx-auto mt-7 grid w-fit grid-cols-3 gap-x-7 gap-y-4 sm:grid-cols-6 sm:gap-x-5">
            <Control icon={live.muted ? MicOff : Mic} label={live.muted ? "Unmute" : "Mute"} on={live.muted} disabled={dialing} onClick={() => softphone.toggleMute()} />
            <Control icon={held ? Play : Pause} label={held ? "Resume" : "Hold"} on={held} disabled={dialing} onClick={() => softphone.toggleHold()} title={leaveMode ? "Hold — everyone else hears the music" : held ? "Resume" : "Hold"} />
            {sp.speaker !== null && (
              // iPhone: speakerphone (the system call screen has the same switch).
              <Control icon={Volume2} label="Speaker" on={!!sp.speaker} disabled={dialing} onClick={() => softphone.toggleSpeaker()} />
            )}
            <Control icon={UserPlus} label="Add" on={addOpen} disabled={dialing || !people.canAdd.ok} onClick={() => setAddOpen(true)} title={people.canAdd.ok ? "Add a person — a teammate, a client, or a number" : people.canAdd.reason} />
            <Control icon={Grid3x3} label="Keypad" on={pad} disabled={dialing} onClick={() => setPad((v) => !v)} title="Keypad — touch-tones for phone menus" />
            <Control icon={StickyNote} label="Note" on={noteOpen} onClick={() => setNoteOpen(true)} title="Stick a note on Home while you talk" />
          </div>
          <div className="mt-5 flex justify-center">
            <Control
              icon={PhoneOff}
              label={dialing ? "Cancel" : leaveMode ? "Leave" : "Hang up"}
              tone="red"
              size="lg"
              onClick={() => (leaveMode && !dialing ? void leave() : softphone.hangup())}
              title={leaveMode ? "Leave — the others stay on the call" : undefined}
            />
          </div>
          {leaveMode && !dialing && (
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => void endForEveryone()}
                className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${confirmEnd ? "bg-[color:var(--ds-bad)] text-white" : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"}`}
              >
                {confirmEnd ? "Tap again to end it for everyone" : "End for everyone"}
              </button>
            </div>
          )}
        </>
      )}
      {live && !ringing && (
        <div className="mx-auto mt-5 max-w-xs text-left">
          <MicRow />
          <MicWarning className="mt-2" />
        </div>
      )}
      {live && pad && !dialing && (
        <div className="mx-auto mt-5 max-w-[260px] border-t border-gray-100 pt-4">
          <DialPad mode="tones" />
        </div>
      )}
      {!live && !ended && row.status === "IN_PROGRESS" && people.canAdd.ok && (
        // On the call elsewhere (a phone, a teammate's browser) or running the company: people can still be added from here.
        <div className="mt-5 flex justify-center">
          <Control icon={UserPlus} label="Add" on={addOpen} onClick={() => setAddOpen(true)} title="Add a person to this call" />
        </div>
      )}

      <AddPersonSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        callId={callId}
        canAdd={people.canAdd}
        onAdded={(p) => {
          setPeople((prev) => ({ ...prev, participants: [...prev.participants.filter((x) => x.id !== p.id), p] }));
          void refreshPeople();
        }}
      />

      <StickyEditor
        open={noteOpen}
        note={null}
        page={`/app/calls/${callId}`}
        prefill={`${label}${number ? ` · ${number}` : ""}`}
        portal
        meId=""
        canPin
        onClose={() => setNoteOpen(false)}
        onSaved={() => window.dispatchEvent(new Event("wb:notes-changed"))}
        onDeleted={() => undefined}
      />
      {terminal && row.status === "VOICEMAIL" && (voicemailRecordingId || voicemailSec !== null) && (
        <div className="mx-auto mt-2 max-w-md text-left">
          <VoicemailPlayer callId={callId} seconds={voicemailSec} />
        </div>
      )}
      {terminal && canCall && customerNumber && customerNumber !== "unknown" && (
        <div className="mt-5 flex justify-center">
          <CallFromLineButton to={customerNumber} contactId={contactId} contactName={label} agentPhone="" label={direction === "INBOUND" ? "Call back" : "Call again"} />
        </div>
      )}
    </div>
  );
}
