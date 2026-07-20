"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Superadmin account controls: reversible suspension, and permanent deletion
 * behind slug + password (+ typed phrase when the company has real data).
 * The server re-verifies every factor — this UI just collects them.
 */
export function AccountActions({
  companyId,
  name,
  slug,
  suspendedAt,
  suspendedReason,
  footprint,
}: {
  companyId: string;
  name: string;
  slug: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  footprint: { users: number; contacts: number; jobs: number; invoices: number; payments: number; large: boolean };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuspend, setShowSuspend] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");

  const suspended = Boolean(suspendedAt);

  async function call(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/companies/${companyId}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Request failed.");
        return false;
      }
      return true;
    } catch {
      setError("Request failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-ledger border-red-200 p-4">
      <h2 className="text-sm font-bold text-red-700">Danger zone</h2>

      {suspended && (
        <p className="mt-2 text-sm text-red-700">
          Suspended since {new Date(suspendedAt as string).toLocaleDateString("en-US")}
          {suspendedReason ? ` — ${suspendedReason}` : ""}. The owner must contact support to be
          reinstated.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {suspended ? (
          <button
            disabled={busy}
            onClick={async () => {
              if (await call("PATCH", { action: "reinstate" })) router.refresh();
            }}
            className="chamfer bg-[#0B57D8] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            Reinstate account
          </button>
        ) : (
          <button
            disabled={busy}
            onClick={() => {
              setShowSuspend((v) => !v);
              setShowDelete(false);
              setError(null);
            }}
            className="rounded border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-800"
          >
            Suspend account…
          </button>
        )}
        <button
          disabled={busy}
          onClick={() => {
            setShowDelete((v) => !v);
            setShowSuspend(false);
            setError(null);
          }}
          className="rounded border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700"
        >
          Delete account…
        </button>
      </div>

      {showSuspend && !suspended && (
        <div className="mt-3 space-y-2 rounded border border-amber-200 bg-amber-50/60 p-3">
          <p className="text-xs text-amber-900">
            The whole team is locked out immediately; public booking, the lead webhook, online
            payments, and automated reminders stop. All data stays intact. Reversible here at any
            time.
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Internal reason (optional, shown only here)"
            className="w-full rounded border border-amber-300 bg-white px-2 py-1.5 text-sm"
          />
          <button
            disabled={busy}
            onClick={async () => {
              if (await call("PATCH", { action: "suspend", reason })) {
                setShowSuspend(false);
                router.refresh();
              }
            }}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Suspending…" : `Suspend ${name}`}
          </button>
        </div>
      )}

      {showDelete && (
        <div className="mt-3 space-y-2 rounded border border-red-200 bg-red-50/60 p-3">
          <p className="text-xs font-medium text-red-900">
            Permanently deletes {name} and every record under it — {footprint.users} users,{" "}
            {footprint.contacts} contacts, {footprint.jobs} jobs, {footprint.invoices} invoices,{" "}
            {footprint.payments} payments. There is no recovery. If the business simply misbehaved,
            suspend instead.
          </p>
          <label className="block text-xs text-red-900">
            Type the company slug <code className="rounded bg-red-100 px-1">{slug}</code> to
            confirm:
            <input
              value={confirmSlug}
              onChange={(e) => setConfirmSlug(e.target.value)}
              className="mt-1 w-full rounded border border-red-300 bg-white px-2 py-1.5 text-sm"
              autoComplete="off"
            />
          </label>
          <label className="block text-xs text-red-900">
            Your superadmin password:
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border border-red-300 bg-white px-2 py-1.5 text-sm"
              autoComplete="current-password"
            />
          </label>
          {footprint.large && (
            <label className="block text-xs font-semibold text-red-900">
              This company has real data. Type <code className="rounded bg-red-100 px-1">PERMANENTLY DELETE</code>:
              <input
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                className="mt-1 w-full rounded border border-red-400 bg-white px-2 py-1.5 text-sm"
                autoComplete="off"
              />
            </label>
          )}
          <button
            disabled={
              busy ||
              confirmSlug !== slug ||
              !password ||
              (footprint.large && phrase !== "PERMANENTLY DELETE")
            }
            onClick={async () => {
              if (await call("DELETE", { confirmSlug, password, phrase })) {
                router.push("/superadmin");
                router.refresh();
              }
            }}
            className="rounded bg-red-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Deleting…" : "Permanently delete this account"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
