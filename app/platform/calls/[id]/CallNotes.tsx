"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Loader2, Sparkles, Square, Trash2 } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { Textarea } from "@/components/Input";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import type { AtlasNotesState } from "@/lib/call-notes";

/**
 * The notes card on the call screen: what you type while they talk (or
 * afterwards), autosaved to the call row — and "Let Atlas take notes":
 * asked while the call is still ringing it is *armed* and Telnyx starts
 * transcribing the moment they answer (the whole conversation on record);
 * asked mid-call it starts then. When the call ends Atlas writes the notes
 * — but only for someone saved: an unsaved caller's transcript is held
 * ("awaiting_contact") with a prompt to save them as a lead or client, or
 * to discard it, and no Atlas tokens are spent until they're saved
 * (lib/call-notes.ts, lib/voice.ts startAtlasNotes/finishAtlasNotes).
 *
 * "Every call" (a per-browser preference, localStorage) arms Atlas on its
 * own whenever a call screen opens for a live call. The card polls its own
 * state while the call is live or Atlas is working, so the notes appear
 * here without a reload.
 */

type Status = "RINGING" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "VOICEMAIL" | "NO_ANSWER" | "FAILED";

export type CallNotesInitial = {
  status: Status;
  contactId: string | null;
  notes: string | null;
  transcript: string | null;
  atlasNotes: string | null;
  atlasNotesState: AtlasNotesState | null;
  atlasNotesError: string | null;
  atlasNotesTokens: number | null;
};

export type AtlasForNotes = {
  name: string;
  /** "on" — the button works; "locked" — out of tokens (reason says so); "off" — no Atlas on this account, nothing shown. */
  mode: "on" | "locked" | "off";
  reason: string | null;
};

const LIVE = new Set<Status>(["RINGING", "IN_PROGRESS"]);
const AUTO_KEY = "wb-atlas-notes-every-call";

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === "1";
  } catch {
    return false;
  }
}
function writeAuto(on: boolean): void {
  try {
    if (on) localStorage.setItem(AUTO_KEY, "1");
    else localStorage.removeItem(AUTO_KEY);
  } catch {
    /* private window: the choice just doesn't survive */
  }
}

export default function CallNotes({ callId, initial, atlas }: { callId: string; initial: CallNotesInitial; atlas: AtlasForNotes }) {
  const [text, setText] = useState(initial.notes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial.notes ?? "");
  const lastText = useRef(text);
  lastText.current = text;

  const [row, setRow] = useState<CallNotesInitial>(initial);
  const [busy, setBusy] = useState<"start" | "stop" | "discard" | null>(null);
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [auto, setAuto] = useState(false);

  // The server's view of the contact may have moved on (saved from the card above) — the poll carries it.
  const contactId = row.contactId;
  const live = LIVE.has(row.status);
  const connected = row.status === "IN_PROGRESS";
  const st = row.atlasNotesState;
  const working = st === "armed" || st === "listening" || st === "summarizing" || st === "awaiting_contact";

  /* ── the typed notes: autosave 700 ms after the last keystroke ── */
  const save = async (value: string) => {
    if (value === lastSaved.current) {
      setSaveState((s) => (s === "saving" ? "saved" : s));
      return;
    }
    setSaveState("saving");
    const r = await postJson(`/api/app/calls/${callId}`, { notes: value }, "PATCH");
    if (r.ok) {
      lastSaved.current = value;
      setSaveState("saved");
    } else {
      setSaveState("failed");
    }
  };
  const onChange = (value: string) => {
    setText(value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void save(value), 700);
  };
  useEffect(() => {
    const flush = () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        void save(lastText.current);
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Atlas: poll while the call is live or Atlas is working ── */
  useEffect(() => {
    if (!live && !working) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/app/calls/${callId}/notes`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as Omit<CallNotesInitial, "notes"> & { notes: string | null };
        if (stop) return;
        setRow((cur) => ({ ...j, notes: cur.notes }));
      } catch {
        /* next tick */
      }
    };
    const t = setInterval(tick, st === "summarizing" ? 2000 : 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [callId, live, working, st]);

  async function atlasAction(action: "start" | "stop" | "discard") {
    setBusy(action);
    setError("");
    const r = await postJson<{ state: AtlasNotesState | null; notes: string | null; error: string | null; tokens: number | null }>(`/api/app/calls/${callId}/notes`, { action });
    setBusy(null);
    if (!r.ok || !r.data) {
      setError(r.data?.error ?? GENERIC_ERROR);
      return;
    }
    const d = r.data;
    setRow((cur) => ({
      ...cur,
      atlasNotesState: d.state,
      atlasNotes: d.notes ?? (action === "discard" ? null : cur.atlasNotes),
      atlasNotesError: d.error,
      atlasNotesTokens: d.tokens ?? cur.atlasNotesTokens,
      transcript: action === "discard" ? null : cur.transcript,
    }));
  }

  // "Every call": arm Atlas on its own the moment a live call screen opens.
  useEffect(() => {
    const on = readAuto();
    setAuto(on);
    if (on && atlas.mode === "on" && LIVE.has(initial.status) && !initial.atlasNotesState) void atlasAction("start");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addToNotes = () => {
    if (!row.atlasNotes) return;
    const next = text.trim() ? `${text.replace(/\s+$/, "")}\n\n${row.atlasNotes}` : row.atlasNotes;
    setText(next);
    void save(next);
  };
  const copyAtlas = async () => {
    if (!row.atlasNotes) return;
    try {
      await navigator.clipboard.writeText(row.atlasNotes);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the text is on screen to select */
    }
  };

  const saveWord = saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : saveState === "failed" ? "Couldn’t save — check your connection" : "";
  const smallBtn = "inline-flex items-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50";
  const pulse = (
    <span className="relative flex h-2.5 w-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
    </span>
  );

  return (
    <section className="card-ledger mt-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeader title="Notes" />
        <span className={`text-xs ${saveState === "failed" ? "text-red-600" : "text-gray-400"}`} aria-live="polite">
          {saveWord}
        </span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
          }
          void save(text);
        }}
        rows={4}
        placeholder={live ? "What do they need? Address, timing, the price you talked about…" : "Anything worth remembering from this call."}
        className="mt-2 w-full resize-y text-sm"
        aria-label="Call notes"
      />

      {atlas.mode !== "off" && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          {/* Nothing yet: the offer, while the call is ringing or up. */}
          {!st && live && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void atlasAction("start")}
                disabled={busy !== null || atlas.mode === "locked"}
                className="btn-primary"
              >
                {busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {connected ? `Let ${atlas.name} take notes` : `Have ${atlas.name} take notes on this call`}
              </button>
              <p className="text-[11px] leading-snug text-gray-500 sm:max-w-[60%]">
                {atlas.mode === "locked"
                  ? atlas.reason
                  : `${connected ? "Transcribes from now" : "Transcribes from the moment they answer"} and writes notes when the call ends — only once they're saved as a lead or client (${atlas.name} tokens). Where the law asks, tell them the call is being transcribed.`}
              </p>
            </div>
          )}

          {st === "armed" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-gray-700">
                <Sparkles size={14} className="text-gray-500" /> {atlas.name} will listen from the moment they answer.
              </p>
              <button type="button" onClick={() => void atlasAction("stop")} disabled={busy !== null} className={smallBtn}>
                {busy === "stop" ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                Never mind
              </button>
            </div>
          )}

          {st === "listening" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-gray-700">
                {pulse}
                {atlas.name} is listening{connected ? "" : " — the notes come when the call ends"}…
              </p>
              <button type="button" onClick={() => void atlasAction("stop")} disabled={busy !== null} className={smallBtn}>
                {busy === "stop" ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                {contactId ? "Stop and write the notes" : "Stop listening"}
              </button>
            </div>
          )}

          {st === "awaiting_contact" && (
            <div className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-sm text-amber-900">
                {atlas.name} has the transcript. <span className="font-medium">Save them as a lead or client above</span> and the notes are written — or discard it and
                nothing is kept.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => void atlasAction("discard")} disabled={busy !== null} className={smallBtn}>
                  {busy === "discard" ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  Discard the transcript
                </button>
              </div>
            </div>
          )}

          {st === "summarizing" && (
            <p className="flex items-center gap-2 text-sm text-gray-700">
              <Loader2 size={14} className="animate-spin text-gray-500" /> {atlas.name} is writing the notes…
            </p>
          )}

          {st === "done" && row.atlasNotes && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                  <Sparkles size={14} className="text-gray-500" /> {atlas.name}’s notes
                  {row.atlasNotesTokens ? <span className="font-normal text-gray-400"> · {row.atlasNotesTokens.toLocaleString()} tokens</span> : null}
                </p>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={addToNotes} className={smallBtn}>
                    <Check size={12} /> Add to my notes
                  </button>
                  <button type="button" onClick={() => void copyAtlas()} className={smallBtn} aria-label="Copy">
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap rounded-[10px] bg-gray-50 px-3 py-2.5 text-sm leading-relaxed text-gray-800">{row.atlasNotes}</p>
              {connected && (
                <button type="button" onClick={() => void atlasAction("start")} disabled={busy !== null} className="mt-2 text-xs font-medium text-gray-600 hover:underline">
                  Keep listening — the call is still on
                </button>
              )}
            </div>
          )}

          {st === "failed" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-amber-800">{row.atlasNotesError ?? `${atlas.name} couldn’t write the notes.`}</p>
              <div className="flex items-center gap-2">
                {connected && (
                  <button type="button" onClick={() => void atlasAction("start")} disabled={busy !== null} className={smallBtn}>
                    <Sparkles size={12} /> Try again
                  </button>
                )}
                <button type="button" onClick={() => void atlasAction("discard")} disabled={busy !== null} className={smallBtn}>
                  <Trash2 size={12} /> Clear
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          {atlas.mode === "on" && (
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={auto}
                onChange={(e) => {
                  setAuto(e.target.checked);
                  writeAuto(e.target.checked);
                  if (e.target.checked && live && !st) void atlasAction("start");
                }}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              Have {atlas.name} take notes on every call from this browser
            </label>
          )}

          {row.transcript && (st === "done" || st === "failed" || st === "awaiting_contact") && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowTranscript((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800"
                aria-expanded={showTranscript}
              >
                <ChevronDown size={12} className={`transition-transform ${showTranscript ? "rotate-180" : ""}`} /> Transcript
              </button>
              {showTranscript && (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-[10px] border border-gray-100 bg-white px-3 py-2 font-sans text-xs leading-relaxed text-gray-600">
                  {row.transcript}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
