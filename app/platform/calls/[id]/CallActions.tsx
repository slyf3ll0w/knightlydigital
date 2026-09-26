"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import SectionHeader from "@/components/SectionHeader";
import { useRouter } from "next/navigation";
import { BadgeCheck, Briefcase, CalendarClock, FileText, Loader2, Receipt, Search, UserPlus, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { fmtPhone } from "@/lib/format";
import { Input } from "@/components/Input";

/**
 * What you do with the person while they're on the line (and after):
 *
 *   unknown number  → Save as a lead / Save as a client (a two-field form —
 *                     the number is already filled in), or pick someone who
 *                     is already in the list but called from another phone.
 *   a lead          → Make a client (the same win as the board's Won zone:
 *                     PATCH /api/app/contacts/[id]/stage { action: "won" }).
 *   anyone saved    → Quote · Appointment · Job · Invoice, each opening the
 *                     builder with them filled in.
 *
 * Saving links the call to the new contact right away
 * (PATCH /api/app/calls/[id]) so the screen, the log and the profile's
 * "Recent calls" all agree the moment the page re-renders.
 */
export default function CallActions({
  callId,
  customerNumber,
  contact,
}: {
  callId: string;
  customerNumber: string;
  contact: { id: string; status: "LEAD" | "ACTIVE" | "ARCHIVED"; name: string } | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<"idle" | "lead" | "client" | "find">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = () => startTransition(() => router.refresh());

  async function link(contactId: string) {
    const r = await postJson(`/api/app/calls/${callId}`, { contactId }, "PATCH");
    if (!r.ok) throw new Error(r.data?.error ?? GENERIC_ERROR);
  }

  async function makeClient() {
    if (!contact) return;
    setBusy(true);
    setError("");
    const r =
      contact.status === "ARCHIVED"
        ? await postJson(`/api/app/contacts/${contact.id}`, { status: "ACTIVE" }, "PATCH")
        : await postJson(`/api/app/contacts/${contact.id}/stage`, { action: "won" }, "PATCH");
    setBusy(false);
    if (!r.ok) {
      setError(r.data?.error ?? GENERIC_ERROR);
      return;
    }
    refresh();
  }

  const create = contact
    ? [
        { href: `/app/quotes/new?contactId=${contact.id}`, label: "Quote", icon: FileText },
        { href: `/app/appointments/new?contactId=${contact.id}`, label: "Appointment", icon: CalendarClock },
        { href: `/app/jobs/new?contactId=${contact.id}`, label: "Job", icon: Briefcase },
        { href: `/app/invoices/new?contactId=${contact.id}`, label: "Invoice", icon: Receipt },
      ]
    : [
        { href: "", label: "Quote", icon: FileText },
        { href: "", label: "Appointment", icon: CalendarClock },
        { href: "", label: "Job", icon: Briefcase },
        { href: "", label: "Invoice", icon: Receipt },
      ];
  const tile = "flex flex-col items-center justify-center gap-1.5 rounded-[12px] btn-tool-line bg-white px-3 py-3.5 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50";

  return (
    <section className="ds-card mt-4 p-4 sm:p-5">
      {!contact ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <SectionHeader title="Not in your list yet" />
            {mode === "idle" && (
              <button type="button" onClick={() => setMode("find")} className="inline-flex items-center gap-1 text-xs font-medium text-gray-600 hover:underline">
                <Search size={12} /> Already a client on another number?
              </button>
            )}
          </div>
          {mode === "idle" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setMode("lead")} className="btn-primary justify-center">
                <UserPlus size={14} /> Save as a lead
              </button>
              <button type="button" onClick={() => setMode("client")} className={`${tile} flex-row py-2`}>
                <BadgeCheck size={14} className="text-gray-500" /> Save as a client
              </button>
            </div>
          )}
          {(mode === "lead" || mode === "client") && (
            <SaveForm
              status={mode === "lead" ? "LEAD" : "ACTIVE"}
              phone={customerNumber}
              onCancel={() => setMode("idle")}
              onSaved={async (id) => {
                await link(id);
                setMode("idle");
                refresh();
              }}
            />
          )}
          {mode === "find" && (
            <FindContact
              onCancel={() => setMode("idle")}
              onPick={async (id) => {
                setBusy(true);
                setError("");
                try {
                  await link(id);
                  setMode("idle");
                  refresh();
                } catch (err) {
                  setError(err instanceof Error ? err.message : GENERIC_ERROR);
                } finally {
                  setBusy(false);
                }
              }}
              busy={busy}
            />
          )}
        </>
      ) : contact.status === "ACTIVE" ? null : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <SectionHeader
              title={contact.status === "LEAD" ? "Still a lead" : "Archived"}
              hint={contact.status === "LEAD" ? "Ready to work with them? Make them a client — the lead lands in Converted." : "Bring them back as an active client."}
            />
          </div>
          <button type="button" onClick={() => void makeClient()} disabled={busy} className="btn-primary shrink-0">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
            Make a client
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className={`${contact && contact.status === "ACTIVE" ? "" : "mt-4 border-t border-gray-100 pt-4"}`}>
        <div className="flex items-baseline justify-between gap-2">
          <SectionHeader title={contact ? `Start something for ${contact.name.split(" ")[0]}` : "Start something"} />
          {!contact && <span className="text-xs text-gray-400">save them first</span>}
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {create.map(({ href, label, icon: Icon }) =>
            href ? (
              <Link key={label} href={href} className={tile}>
                <Icon size={18} className="text-gray-500" />
                {label}
              </Link>
            ) : (
              <span key={label} className={`${tile} cursor-default opacity-40 hover:bg-white`} aria-disabled>
                <Icon size={18} className="text-gray-500" />
                {label}
              </span>
            )
          )}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────── Save as a lead / client ───────────────────── */

function SaveForm({
  status,
  phone,
  onCancel,
  onSaved,
}: {
  status: "LEAD" | "ACTIVE";
  phone: string;
  onCancel: () => void;
  onSaved: (contactId: string) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [number, setNumber] = useState(fmtPhone(phone) || phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name, please.");
      return;
    }
    setBusy(true);
    setError("");
    const r = await postJson<{ id: string }>("/api/app/contacts", {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: number.trim() || null,
      email: email.trim() || null,
      status,
      leadSource: "Phone call",
    });
    if (!r.ok || !r.data?.id) {
      setBusy(false);
      setError(r.data?.error ?? GENERIC_ERROR);
      return;
    }
    try {
      await onSaved(r.data.id);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-800">{status === "LEAD" ? "New lead" : "New client"}</p>
        <button type="button" onClick={onCancel} className="text-xs text-gray-500 hover:underline">
          Cancel
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Input autoFocus placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" />
        <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" />
        <Input type="tel" placeholder="Phone" value={number} onChange={(e) => setNumber(e.target.value)} className="numeral-ledger" />
        <Input type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
      </div>
      {error && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button type="submit" disabled={busy} className="btn-primary">
          {busy ? <Loader2 size={14} className="animate-spin" /> : status === "LEAD" ? <UserPlus size={14} /> : <BadgeCheck size={14} />}
          {status === "LEAD" ? "Save lead" : "Save client"}
        </button>
      </div>
    </form>
  );
}

/* ───────────────── Someone already in the list ───────────────── */

type Hit = { id: string; label: string; sub: string };

function FindContact({ onCancel, onPick, busy }: { onCancel: () => void; onPick: (id: string) => void; busy: boolean }) {
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
        <Input autoFocus placeholder="Search your clients and leads" value={q} onChange={(e) => setQ(e.target.value)} className="w-full pl-9 pr-9" autoComplete="off" />
        <button type="button" onClick={onCancel} aria-label="Cancel" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <X size={14} />
        </button>
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
                <span className="text-xs text-gray-500">This is them</span>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">{searching ? "Searching…" : "Nobody by that name."}</li>}
        </ul>
      )}
    </div>
  );
}
