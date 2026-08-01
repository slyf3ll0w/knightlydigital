"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Pencil, Phone, Plus, Trash2, User } from "lucide-react";
import { confirmSheet } from "@/components/ConfirmSheet";

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

const EMPTY = { firstName: "", lastName: "", role: "", email: "", phone: "", notes: "" };

const fullName = (p: { firstName: string; lastName: string }) =>
  `${p.firstName} ${p.lastName}`.trim();

/**
 * Other people on the same client: a second decision-maker at a business, or
 * a spouse on a household account. They deliberately aren't separate clients —
 * one record keeps all the quotes, jobs and invoices in one history — so this
 * card is where the extra names, emails and numbers live.
 */
export default function PeopleCard({
  contactId,
  primaryName,
  primaryRole,
  people,
}: {
  contactId: string;
  primaryName: string;
  primaryRole: string | null;
  people: Person[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function startNew() {
    setForm(EMPTY);
    setError("");
    setEditing("new");
  }

  function startEdit(p: Person) {
    setForm({
      firstName: p.firstName,
      lastName: p.lastName,
      role: p.role ?? "",
      email: p.email ?? "",
      phone: p.phone ?? "",
      notes: p.notes ?? "",
    });
    setError("");
    setEditing(p.id);
  }

  async function save() {
    if (!form.firstName.trim() && !form.lastName.trim()) {
      setError("Give this person a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const url =
        editing === "new"
          ? `/api/app/contacts/${contactId}/people`
          : `/api/app/contacts/${contactId}/people/${editing}`;
      const res = await fetch(url, {
        method: editing === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "Couldn't save this contact.");
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

  async function remove(p: Person) {
    if (
      !(await confirmSheet({
        message: `Remove ${fullName(p) || "this contact"} from this client?`,
        confirmLabel: "Remove Contact",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/app/contacts/${contactId}/people/${p.id}`, { method: "DELETE" });
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
        <h2 className="text-[13px] font-semibold text-gray-500">Contacts</h2>
        {editing === null && (
          <button
            onClick={startNew}
            className="flex items-center gap-1 text-xs text-green-600 hover:underline font-medium"
          >
            <Plus size={12} />
            Add contact
          </button>
        )}
      </div>

      <div className="space-y-2.5">
        {/* The client record's own name is the primary — edited on the Edit form */}
        <div className="flex items-start gap-2 text-sm">
          <User size={14} className="text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-gray-800">{primaryName}</p>
            <p className="text-[11px] text-gray-400">
              {primaryRole ? `${primaryRole} · Primary` : "Primary — edit via the Edit button above"}
            </p>
          </div>
        </div>

        {people.map((p) =>
          editing === p.id ? null : (
            <div key={p.id} className="flex items-start gap-2 text-sm group">
              <User size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-gray-800">{fullName(p)}</p>
                {p.role && <p className="text-[11px] text-gray-400">{p.role}</p>}
                {/* tel:/mailto: so a phone can just tap the row */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  {p.phone && (
                    <a
                      href={`tel:${p.phone.replace(/[^\d+]/g, "")}`}
                      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-green-600"
                    >
                      <Phone size={10} />
                      {p.phone}
                    </a>
                  )}
                  {p.email && (
                    <a
                      href={`mailto:${p.email}`}
                      className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-green-600 truncate"
                    >
                      <Mail size={10} />
                      {p.email}
                    </a>
                  )}
                </div>
                {p.notes && <p className="text-[11px] text-gray-400 mt-0.5">{p.notes}</p>}
              </div>
              <button
                onClick={() => startEdit(p)}
                className="p-1 text-gray-300 hover:text-gray-600"
                title="Edit contact"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => remove(p)}
                className="p-1 text-gray-300 hover:text-red-600"
                title="Remove contact"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        )}
      </div>

      {editing !== null && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              placeholder="First name"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
              maxLength={80}
              className={inputCls}
            />
            <input
              type="text"
              placeholder="Last name"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
              maxLength={80}
              className={inputCls}
            />
          </div>
          <input
            type="text"
            placeholder="Role (e.g. Office manager, Spouse) — optional"
            value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            maxLength={80}
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="email"
              placeholder="Email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              maxLength={254}
              className={inputCls}
            />
            <input
              type="tel"
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              maxLength={30}
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
              {editing === "new" ? "Add contact" : "Save"}
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
