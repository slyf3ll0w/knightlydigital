"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MapPin, Plus, Pencil, Trash2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { confirmSheet } from "@/components/ConfirmSheet";

type Addr = {
  id: string;
  label: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type HistoryRow = {
  key: string;
  kind: string; // "Job" | "Quote" | "Appointment"
  title: string;
  href: string;
  date: string | null;
};

const EMPTY = { label: "", address: "", city: "", state: "", zip: "" };

function line(a: { address: string; city: string | null; state: string | null; zip: string | null }) {
  return [a.address, a.city, a.state, a.zip].filter(Boolean).join(", ");
}

/**
 * Service addresses for a contact. The primary comes from the contact record
 * itself (edited on the Edit form); extra locations (rentals, second shops)
 * are managed inline here and offered wherever a job address gets picked.
 */
export default function AddressesCard({
  contactId,
  primary,
  addresses,
  history = {},
}: {
  contactId: string;
  primary: string | null;
  addresses: Addr[];
  /** Work linked to each saved address (per-property history), by address id */
  history?: Record<string, HistoryRow[]>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startNew() {
    setForm(EMPTY);
    setError("");
    setEditing("new");
  }

  function startEdit(a: Addr) {
    setForm({
      label: a.label ?? "",
      address: a.address,
      city: a.city ?? "",
      state: a.state ?? "",
      zip: a.zip ?? "",
    });
    setError("");
    setEditing(a.id);
  }

  async function save() {
    if (!form.address.trim()) {
      setError("Street address is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const url =
        editing === "new"
          ? `/api/app/contacts/${contactId}/addresses`
          : `/api/app/contacts/${contactId}/addresses/${editing}`;
      const res = await fetch(url, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't save this address.");
        return;
      }
      setEditing(null);
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (
      !(await confirmSheet({
        message: "Remove this address?",
        confirmLabel: "Remove Address",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/app/contacts/${contactId}/addresses/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

  return (
    <div className="card-ledger p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-gray-500">Addresses</h2>
        {editing === null && (
          <button
            onClick={startNew}
            className="flex items-center gap-1 text-xs text-green-600 hover:underline font-medium"
          >
            <Plus size={12} />
            Add address
          </button>
        )}
      </div>

      <div className="space-y-2">
        {primary && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-gray-800">{primary}</p>
              <p className="text-[11px] text-gray-400">Primary — edit via the Edit button above</p>
            </div>
          </div>
        )}
        {!primary && addresses.length === 0 && editing === null && (
          <p className="text-xs text-gray-400">No addresses on file yet.</p>
        )}

        {addresses.map((a) => {
          if (editing === a.id) return null;
          const rows = history[a.id] ?? [];
          const isOpen = openHistory === a.id;
          return (
            <div key={a.id}>
              <div className="flex items-start gap-2 text-sm group">
                <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-gray-800">{line(a)}</p>
                  <div className="flex items-center gap-2">
                    {a.label && <p className="text-[11px] text-gray-400">{a.label}</p>}
                    {rows.length > 0 && (
                      <button
                        onClick={() => setOpenHistory(isOpen ? null : a.id)}
                        className="flex items-center gap-0.5 text-[11px] text-green-700 hover:underline"
                      >
                        {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        {rows.length} {rows.length === 1 ? "visit" : "visits"} here
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => startEdit(a)}
                  className="p-1 text-gray-300 hover:text-gray-600"
                  title="Edit address"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => remove(a.id)}
                  className="p-1 text-gray-300 hover:text-red-600"
                  title="Remove address"
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {isOpen && (
                <ul className="ml-6 mt-1 mb-1 space-y-0.5 border-l border-gray-100 pl-3">
                  {rows.map((r) => (
                    <li key={r.key} className="text-xs">
                      <Link href={r.href} className="group/row flex items-baseline gap-1.5">
                        <span className="text-gray-400 w-[4.5rem] shrink-0">{r.kind}</span>
                        <span className="text-gray-700 truncate group-hover/row:underline">
                          {r.title}
                        </span>
                        {r.date && (
                          <span className="ml-auto shrink-0 text-gray-400">
                            {new Date(r.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {editing !== null && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <input
            type="text"
            placeholder="Label (e.g. Rental on 5th St) — optional"
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            maxLength={60}
            className={inputCls}
          />
          <input
            type="text"
            placeholder="Street address"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            maxLength={200}
            className={inputCls}
          />
          <div className="grid grid-cols-[1fr_70px_90px] gap-2">
            <input
              type="text"
              placeholder="City"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              maxLength={100}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="State"
              value={form.state}
              onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
              maxLength={40}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="ZIP"
              value={form.zip}
              onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
              maxLength={20}
              className={inputCls}
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-60"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              {editing === "new" ? "Add address" : "Save"}
            </button>
            <button
              onClick={() => setEditing(null)}
              disabled={busy}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
