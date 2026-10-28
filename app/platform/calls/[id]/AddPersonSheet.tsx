"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, Smartphone, X } from "lucide-react";
import Modal from "@/components/Modal";
import Monogram from "@/components/Monogram";
import DialPad from "@/components/DialPad";
import { Input } from "@/components/Input";
import type { ParticipantView } from "@/lib/voice";

/**
 * "Add" on the call screen: who joins the live call. Three ways to pick —
 * a teammate (rung in the app, the way an inbound call rings them, with a
 * "wants to add you" card), a client or lead from the list (dialed from the
 * business line), or a number on the keypad. One tap rings them; the
 * participant strip on the call screen shows them ringing, then on. Posts to
 * /api/app/line/call/participants (lib/voice.ts addParticipant).
 */

type Tab = "team" | "clients" | "number";
type Teammate = { id: string; name: string; online: "app" | "phone" | null };
type Hit = { id: string; label: string; sub: string };

export default function AddPersonSheet({
  open,
  onClose,
  callId,
  onAdded,
  canAdd,
}: {
  open: boolean;
  onClose: () => void;
  callId: string;
  onAdded: (p: ParticipantView) => void;
  /** Why nobody can be added right now (the cap, not connected), or null. */
  canAdd: { ok: boolean; reason?: string };
}) {
  const [tab, setTab] = useState<Tab>("team");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) setError("");
  }, [open]);

  async function add(target: { userId?: string; contactId?: string; to?: string }) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/line/call/participants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callId, ...target }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; participant?: ParticipantView };
      if (!res.ok || !j.participant) throw new Error(j.error || "Couldn't add them.");
      onAdded(j.participant);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add them.");
    } finally {
      setBusy(false);
    }
  }

  const seg = (t: Tab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setTab(t);
        setError("");
      }}
      aria-pressed={tab === t}
      className={`flex-1 rounded-[9px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${tab === t ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
    >
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Add a person</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X size={16} />
        </button>
      </div>
      {!canAdd.ok ? (
        <p className="mt-3 text-sm text-gray-600">{canAdd.reason ?? "Nobody can be added right now."}</p>
      ) : (
        <>
          <div className="mt-3 flex gap-1 rounded-[11px] bg-gray-50 p-1">
            {seg("team", "Your team")}
            {seg("clients", "Clients")}
            {seg("number", "A number")}
          </div>
          {tab === "team" && <TeamList callId={callId} busy={busy} onPick={(id) => add({ userId: id })} />}
          {tab === "clients" && <ClientSearch busy={busy} onPick={(id) => add({ contactId: id })} />}
          {tab === "number" && (
            <div className="mx-auto mt-3 max-w-[260px]">
              <DialPad mode="dial" callLabel="Add" onDial={(t) => add(t.contactId ? { contactId: t.contactId } : { to: t.to })} />
            </div>
          )}
          {error && (
            <p className="mt-3 text-center text-[13px] text-red-600" role="alert">
              {error}
            </p>
          )}
          {busy && (
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[13px] text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Ringing them…
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

/* ───────────────── Your team ───────────────── */

function TeamList({ callId, busy, onPick }: { callId: string; busy: boolean; onPick: (userId: string) => void }) {
  const [team, setTeam] = useState<Teammate[] | null>(null);
  useEffect(() => {
    let stale = false;
    fetch(`/api/app/line/call/participants?callId=${encodeURIComponent(callId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { team: [] }))
      .then((j: { team?: Teammate[] }) => {
        if (!stale) setTeam(j.team ?? []);
      })
      .catch(() => {
        if (!stale) setTeam([]);
      });
    return () => {
      stale = true;
    };
  }, [callId]);

  if (team === null) return <p className="mt-4 text-center text-sm text-gray-400">Looking…</p>;
  if (team.length === 0) return <p className="mt-4 text-center text-sm text-gray-400">Nobody else on your team takes calls.</p>;
  return (
    <ul className="mt-3 divide-y divide-gray-100 rounded-[10px] border border-gray-200">
      {team.map((u) => {
        const reach = u.online === "app" ? "In the app" : u.online === "phone" ? "On their phone" : "Not in the app right now";
        const dot = u.online ? "bg-[color:var(--ds-good)]" : "bg-gray-300";
        return (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onPick(u.id)}
              disabled={busy || !u.online}
              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              <span className="relative shrink-0">
                <Monogram name={u.name} size={32} />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${dot}`} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-800">{u.name}</span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  {u.online === "phone" && <Smartphone size={11} />}
                  {reach}
                </span>
              </span>
              {u.online && <span className="text-xs font-medium text-gray-700">Ring</span>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ───────────────── Clients and leads ───────────────── */

function ClientSearch({ busy, onPick }: { busy: boolean; onPick: (contactId: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }
    let stale = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/app/search?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = (await res.json()) as { results?: Array<{ href: string; label: string; sub?: string; group: string }> };
        if (stale) return;
        setHits(
          (j.results ?? [])
            .filter((r) => r.group === "Clients")
            .map((r) => ({ id: r.href.split("/").pop() ?? "", label: r.label, sub: r.sub ?? "" }))
            .filter((r) => r.id)
        );
      } catch {
        if (!stale) setHits([]);
      } finally {
        if (!stale) setSearching(false);
      }
    }, 200);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="mt-3">
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input autoFocus placeholder="Search your clients and leads" value={q} onChange={(e) => setQ(e.target.value)} className="w-full pl-9" autoComplete="off" />
      </div>
      {q.trim().length >= 2 && (
        <ul className="mt-2 divide-y divide-gray-100 rounded-[10px] border border-gray-200">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => onPick(h.id)} disabled={busy} className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-gray-800">{h.label}</span>
                  {h.sub && <span className="text-gray-400"> · {h.sub}</span>}
                </span>
                <span className="text-xs font-medium text-gray-700">Ring</span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">{searching ? "Searching…" : "Nobody by that name."}</li>}
        </ul>
      )}
    </div>
  );
}
