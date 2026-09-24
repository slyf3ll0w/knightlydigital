"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Loader2, Sparkles, Square } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { Textarea } from "@/components/Input";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * The notes card on the call screen: what you type while they talk (or
 * afterwards), autosaved to the call row — and, on a live call, "Let Atlas
 * take notes": Telnyx transcribes the line, Atlas writes the notes when the
 * call ends or when you press Stop (lib/call-notes.ts; costs Atlas tokens
 * at the summary). The card polls its own state while the call is live or
 * Atlas is working, so the notes appear here without a reload.
 */

type Status = "RINGING" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "VOICEMAIL" | "NO_ANSWER" | "FAILED";
type AtlasState = "listening" | "summarizing" | "done" | "failed" | null;

export type CallNotesInitial = {
  status: Status;
  notes: string | null;
  transcript: string | null;
  atlasNotes: string | null;
  atlasNotesState: AtlasState;
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

export default function CallNotes({ callId, initial, atlas }: { callId: string; initial: CallNotesInitial; atlas: AtlasForNotes }) {
  const [text, setText] = useState(initial.notes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial.notes ?? "");

  const [row, setRow] = useState<CallNotesInitial>(initial);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [copied, setCopied] = useState(false);

  const live = LIVE.has(row.status);
  const connected = row.status === "IN_PROGRESS";
  const working = row.atlasNotesState === "listening" || row.atlasNotesState === "summarizing";

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
  const lastText = useRef(text);
  lastText.current = text;

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
    const t = setInterval(tick, working ? 2500 : 4000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [callId, live, working]);

  async function atlasAction(action: "start" | "stop") {
    setBusy(action);
    setError("");
    const r = await postJson<{ state: AtlasState; notes: string | null; error: string | null; tokens: number | null }>(`/api/app/calls/${callId}/notes`, { action });
    setBusy(null);
    if (!r.ok || !r.data) {
      setError(r.data?.error ?? GENERIC_ERROR);
      return;
    }
    const d = r.data;
    setRow((cur) => ({ ...cur, atlasNotesState: d.state, atlasNotes: d.notes ?? cur.atlasNotes, atlasNotesError: d.error, atlasNotesTokens: d.tokens ?? cur.atlasNotesTokens }));
  }

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
          {/* Nothing yet: the offer, only while the call is up. */}
          {!row.atlasNotesState && (connected || live) && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => void atlasAction("start")}
                disabled={busy !== null || !connected || atlas.mode === "locked"}
                className="btn-primary"
                title={!connected ? `${atlas.name} can start once the call is connected` : undefined}
              >
                {busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Let {atlas.name} take notes
              </button>
              <p className="text-[11px] leading-snug text-gray-500 sm:max-w-[60%]">
                {atlas.mode === "locked"
                  ? atlas.reason
                  : `Transcribes the call and writes notes when it ends. Uses ${atlas.name} tokens. Where the law asks, tell them the call is being transcribed.`}
              </p>
            </div>
          )}

          {row.atlasNotesState === "listening" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm text-gray-700">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
                </span>
                {atlas.name} is listening{connected ? "" : " — the notes come when the call ends"}…
              </p>
              <button type="button" onClick={() => void atlasAction("stop")} disabled={busy !== null} className={smallBtn}>
                {busy === "stop" ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
                Stop and write the notes
              </button>
            </div>
          )}

          {row.atlasNotesState === "summarizing" && (
            <p className="flex items-center gap-2 text-sm text-gray-700">
              <Loader2 size={14} className="animate-spin text-gray-500" /> {atlas.name} is writing the notes…
            </p>
          )}

          {row.atlasNotesState === "done" && row.atlasNotes && (
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

          {row.atlasNotesState === "failed" && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-amber-800">{row.atlasNotesError ?? `${atlas.name} couldn’t write the notes.`}</p>
              {connected && (
                <button type="button" onClick={() => void atlasAction("start")} disabled={busy !== null} className={smallBtn}>
                  <Sparkles size={12} /> Try again
                </button>
              )}
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}

          {row.transcript && (row.atlasNotesState === "done" || row.atlasNotesState === "failed") && (
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
