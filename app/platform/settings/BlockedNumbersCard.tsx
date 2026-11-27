"use client";

import { useEffect, useState } from "react";
import { Ban } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { InfoTip } from "@/components/ds";

/**
 * Settings → Phone & texting → Blocked numbers (lib/blocked-numbers.ts,
 * ticket #bwggje). The list, a box to block a number by typing it, and
 * Unblock on each row. Numbers are usually blocked from where they show up:
 * the call page and a conversation's menu.
 */
type Row = { id: string; digits: string; number: string; label: string | null; createdAt: string };

export default function BlockedNumbersCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/app/blocked-numbers", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { blocked?: Row[] } | null) => setRows(j?.blocked ?? []))
      .catch(() => setRows([]));
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/app/blocked-numbers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = (await res.json().catch(() => null)) as { blocked?: Row; error?: string } | null;
      if (!res.ok || !data?.blocked) {
        setError(data?.error || "That didn't save. Try again.");
        return;
      }
      const row = data.blocked;
      setRows((prev) => [row, ...(prev ?? []).filter((r) => r.digits !== row.digits)]);
      setPhone("");
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function unblock(row: Row) {
    setError("");
    const before = rows;
    setRows((prev) => (prev ?? []).filter((r) => r.id !== row.id));
    const res = await fetch(`/api/app/blocked-numbers?phone=${encodeURIComponent(row.digits)}`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      setRows(before);
      setError("Couldn't unblock that number. Try again.");
    }
  }

  return (
    <div className="ds-card p-5 space-y-4" data-blocked-numbers>
      <SectionHeader
        title="Blocked numbers"
        action={
          <InfoTip align="end" label="What blocking does">
            Calls from a blocked number don&apos;t ring and can&apos;t leave a voicemail, and its texts don&apos;t reach Messages. You can still call and text them. Block a number from its call page or from a conversation&apos;s menu, or type it here.
          </InfoTip>
        }
      />
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <input
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 555-0100"
          aria-label="Phone number to block"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[color:var(--ds-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary-soft)] sm:max-w-[240px]"
        />
        <button type="submit" disabled={busy || !phone.trim()} className="ds-btn inline-flex items-center gap-1.5 disabled:opacity-50">
          <Ban size={14} />
          {busy ? "Blocking…" : "Block"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-xs text-[color:var(--ds-bad)]">
          {error}
        </p>
      )}
      {rows === null ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No blocked numbers.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="numeral-ledger font-medium text-gray-900">{r.number}</span>
                {r.label && <span className="text-gray-500"> · {r.label}</span>}
              </span>
              <button type="button" onClick={() => void unblock(r)} className="shrink-0 text-xs font-semibold text-gray-600 underline-offset-2 hover:text-gray-900 hover:underline">
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
