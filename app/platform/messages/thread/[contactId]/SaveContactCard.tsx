"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Search, UserPlus, Users } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Sits above a thread whose number nobody has named yet — one the team
 * started by typing a number, or a text that came in from an unknown number
 * (the webhook files those as placeholder contacts named after the number).
 * The phone's own "unknown number" choices:
 *
 * - Create: name the person and file them as a lead (onto the Leads board —
 *   in Contacted when the team has already replied), a client, or a business
 *   contact — one PATCH to /api/app/contacts/[id] that clears the
 *   placeholder flag. Only the first name is required.
 * - Add to existing: pick a saved client; the thread (and anything else on
 *   the number) moves to them and this number becomes theirs
 *   (POST /api/app/contacts/[id]/merge). The page then shows their thread.
 *
 * Gone once saved.
 */

type FeedContact = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  phone: string | null;
  kind: "CLIENT" | "CONTACT";
};

const fullName = (c: FeedContact) => `${c.firstName} ${c.lastName}`.trim() || "Unnamed";

function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

type As = "lead" | "client" | "contact" | "existing";

export default function SaveContactCard({
  contactId,
  phone,
  textedFirst = false,
}: {
  contactId: string;
  phone: string;
  /** The other side wrote first (an inbound text from an unknown number). */
  textedFirst?: boolean;
}) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [company, setCompany] = useState("");
  const [as, setAs] = useState<As>("lead");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // "Add to existing": the picker feed (/api/app/contacts — saved clients
  // and contacts, never other unsaved numbers), filtered as you type.
  const [contacts, setContacts] = useState<FeedContact[] | null>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<FeedContact | null>(null);
  useEffect(() => {
    if (as !== "existing" || contacts) return;
    let stopped = false;
    fetch("/api/app/contacts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: FeedContact[]) => {
        if (!stopped) setContacts(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!stopped) setError("Couldn't load your clients. Try again.");
      });
    return () => {
      stopped = true;
    };
  }, [as, contacts]);
  const q = query.trim().toLowerCase();
  const qDigits = query.replace(/\D/g, "");
  const matches = useMemo(() => {
    if (!contacts) return [];
    const list = !q
      ? contacts
      : contacts.filter((c) => {
          if (fullName(c).toLowerCase().includes(q)) return true;
          if (c.companyName?.toLowerCase().includes(q)) return true;
          if (qDigits.length >= 3 && c.phone && c.phone.replace(/\D/g, "").includes(qDigits)) return true;
          return false;
        });
    return list.slice(0, 6);
  }, [contacts, q, qDigits]);

  const replaces = picked?.phone && prettyPhone(picked.phone) !== phone ? prettyPhone(picked.phone) : null;
  const canSave = as === "existing" ? Boolean(picked) : Boolean(first.trim());

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !canSave) return;
    setBusy(true);
    setError("");
    if (as === "existing" && picked) {
      const { ok, data } = await postJson<{ contactId: string }>(`/api/app/contacts/${contactId}/merge`, { into: picked.id });
      setBusy(false);
      if (!ok || !data?.contactId) {
        setError((data as { error?: string } | null)?.error ?? GENERIC_ERROR);
        return;
      }
      // This thread no longer exists — it is theirs now.
      router.replace(`/app/messages/thread/${data.contactId}`);
      return;
    }
    const { ok, data } = await postJson(
      `/api/app/contacts/${contactId}`,
      {
        firstName: first,
        lastName: last,
        companyName: company,
        kind: as === "contact" ? "CONTACT" : "CLIENT",
        status: as === "lead" ? "LEAD" : "ACTIVE",
        placeholder: false,
      },
      "PATCH"
    );
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.refresh();
  }

  const input =
    "w-full rounded-[10px] border border-[color:var(--ds-line-strong)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm text-[color:var(--ds-ink)] placeholder:text-[color:var(--ds-faint)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";
  const chip = (on: boolean) =>
    `rounded-[10px] border px-3.5 py-1.5 text-sm font-medium transition-colors ${
      on
        ? "border-[color:var(--ds-primary)] ring-2 ring-[color:var(--ds-primary-soft)] text-[color:var(--ds-ink)]"
        : "border-[color:var(--ds-line-strong)] text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)]"
    }`;

  return (
    <form onSubmit={save} className="ds-card mb-4 p-4 sm:p-5" data-testid="save-contact-card">
      <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--ds-ink)]">
        <UserPlus size={15} className="text-[color:var(--ds-primary)]" />
        {textedFirst ? `${phone} texted you — who is this?` : `Who is ${phone}?`}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["lead", "Lead", "Goes on your Leads board — in Contacted once you've replied"],
            ["client", "Client", "Existing business — skips the board"],
            ["contact", "Contact", "A business connection, not a client"],
          ] as const
        ).map(([value, label, hint]) => (
          <button key={value} type="button" onClick={() => setAs(value)} title={hint} aria-pressed={as === value} className={chip(as === value)}>
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setAs("existing")}
          title="Someone you already have — the texts move to them and this becomes their number"
          aria-pressed={as === "existing"}
          className={`${chip(as === "existing")} inline-flex items-center gap-1.5`}
        >
          <Users size={14} />
          Add to existing
        </button>
      </div>

      {as === "existing" ? (
        <div className="mt-3">
          <label className="flex items-center gap-2 rounded-[10px] border border-[color:var(--ds-line-strong)] bg-[color:var(--ds-surface)] px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-[color:var(--ds-primary)]">
            <Search size={14} className="shrink-0 text-[color:var(--ds-faint)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPicked(null);
              }}
              placeholder="Search name, company or phone…"
              autoComplete="off"
              className="w-full bg-transparent text-[color:var(--ds-ink)] outline-none placeholder:text-[color:var(--ds-faint)]"
            />
          </label>
          <ul className="mt-2 divide-y divide-[color:var(--ds-line)] overflow-hidden rounded-[10px] border border-[color:var(--ds-line)]" data-testid="save-contact-existing">
            {contacts === null && !error && (
              <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-[color:var(--ds-muted)]">
                <Loader2 size={14} className="animate-spin" /> Loading…
              </li>
            )}
            {contacts !== null && matches.length === 0 && <li className="px-3 py-2.5 text-sm text-[color:var(--ds-muted)]">No one matches.</li>}
            {matches.map((c) => {
              const on = picked?.id === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setPicked(on ? null : c)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${on ? "bg-[color:var(--ds-primary-soft)]" : "hover:bg-[color:var(--ds-surface-2)]"}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[color:var(--ds-ink)]">{fullName(c)}</span>
                      <span className="block truncate text-xs text-[color:var(--ds-muted)]">
                        {[c.companyName, c.phone ? prettyPhone(c.phone) : null].filter(Boolean).join(" · ") || (c.kind === "CONTACT" ? "Contact" : "Client")}
                      </span>
                    </span>
                    {on && <Check size={16} className="shrink-0 text-[color:var(--ds-primary)]" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" required autoComplete="off" className={input} />
          <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name (optional)" autoComplete="off" className={input} />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company (optional)"
            autoComplete="off"
            className={`${input} col-span-2`}
          />
        </div>
      )}

      <div className="mt-3 flex items-center justify-end">
        <button type="submit" disabled={busy || !canSave} className="btn-primary h-9">
          {busy ? <Loader2 size={14} className="animate-spin" /> : as === "existing" ? <Users size={14} /> : <UserPlus size={14} />}
          {as === "existing" && picked
            ? `Add to ${picked.firstName || fullName(picked)}${replaces ? ` · replaces ${replaces}` : ""}`
            : as === "existing"
              ? "Add to existing"
              : "Save"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </form>
  );
}
