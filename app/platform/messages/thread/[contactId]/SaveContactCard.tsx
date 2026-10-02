"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Sits above a thread that was started with a typed-in number (a PLACEHOLDER
 * contact named after the number). Names the person and files them as a
 * lead (onto the Leads board), a client, or a business contact — one PATCH
 * to /api/app/contacts/[id] that clears the placeholder flag. Gone once saved.
 */
export default function SaveContactCard({ contactId, phone }: { contactId: string; phone: string }) {
  const router = useRouter();
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [company, setCompany] = useState("");
  const [as, setAs] = useState<"lead" | "client" | "contact">("lead");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
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
    "w-full rounded-[10px] border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";

  return (
    <form onSubmit={save} className="ds-card mb-4 p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-semibold text-gray-900">
        <UserPlus size={15} className="text-[color:var(--ds-primary)]" />
        Who is {phone}?
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input value={first} onChange={(e) => setFirst(e.target.value)} placeholder="First name" required className={input} />
        <input value={last} onChange={(e) => setLast(e.target.value)} placeholder="Last name (optional)" className={input} />
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className={`${input} col-span-2`} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {(
          [
            ["lead", "Lead", "Goes on your Leads board"],
            ["client", "Client", "Existing business — skips the board"],
            ["contact", "Contact", "A business connection, not a client"],
          ] as const
        ).map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            onClick={() => setAs(value)}
            title={hint}
            className={`rounded-[10px] border px-3.5 py-1.5 text-sm font-medium transition-colors ${
              as === value
                ? "border-[color:var(--ds-primary)] ring-2 ring-[color:var(--ds-primary-soft)] text-gray-900"
                : "border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {label}
          </button>
        ))}
        <button type="submit" disabled={busy || !first.trim() || !last.trim()} className="btn-primary ml-auto h-9">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
          Save
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </form>
  );
}
