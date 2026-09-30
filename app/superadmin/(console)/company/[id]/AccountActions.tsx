"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, InfoTip } from "@/components/ds";
import { Input } from "@/components/Input";

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
    <Card className="p-5" style={{ boxShadow: "0 0 0 1px var(--ds-bad-soft), var(--ds-shadow-1)" }}>
      <div className="flex items-center gap-1.5">
        <h2 className="ds-h2" style={{ color: "var(--ds-bad)" }}>
          Suspend or delete
        </h2>
        <InfoTip>
          Suspending locks the whole team out immediately; public booking, the lead webhook, online payments and
          automated reminders stop. All data stays intact and it is reversible here at any time. Deleting is
          permanent and removes every record under the account — if the business simply misbehaved, suspend
          instead.
        </InfoTip>
      </div>

      {suspended && (
        <p className="mt-3 text-sm text-[color:var(--ds-bad)]">
          Suspended since {new Date(suspendedAt as string).toLocaleDateString("en-US")}
          {suspendedReason ? ` — ${suspendedReason}` : ""}. The owner must contact support to be reinstated.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {suspended ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await call("PATCH", { action: "reinstate" })) router.refresh();
            }}
          >
            Reinstate account
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setShowSuspend((v) => !v);
              setShowDelete(false);
              setError(null);
            }}
            className="!text-[color:var(--ds-warn)]"
          >
            Suspend account…
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => {
            setShowDelete((v) => !v);
            setShowSuspend(false);
            setError(null);
          }}
          className="!text-[color:var(--ds-bad)]"
        >
          Delete account…
        </Button>
      </div>

      {showSuspend && !suspended && (
        <div className="mt-4 space-y-3 rounded-xl bg-[color:var(--ds-warn-soft)] p-4">
          <p className="text-sm text-[color:var(--ds-ink)]">
            The whole team is locked out immediately; public booking, the lead webhook, online payments, and
            automated reminders stop. All data stays intact. Reversible here at any time.
          </p>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Internal reason (optional, shown only here)" className="w-full" />
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await call("PATCH", { action: "suspend", reason })) {
                setShowSuspend(false);
                router.refresh();
              }
            }}
            className="!bg-[color:var(--ds-warn)]"
          >
            {busy ? "Suspending…" : `Suspend ${name}`}
          </Button>
        </div>
      )}

      {showDelete && (
        <div className="mt-4 space-y-3 rounded-xl bg-[color:var(--ds-bad-soft)] p-4">
          <p className="text-sm font-medium text-[color:var(--ds-ink)]">
            Permanently deletes {name} and every record under it — {footprint.users} users, {footprint.contacts}{" "}
            contacts, {footprint.jobs} jobs, {footprint.invoices} invoices, {footprint.payments} payments. There is no
            recovery.
          </p>
          <label className="block text-sm text-[color:var(--ds-ink)]">
            Type the company slug <code className="ds-num rounded bg-[color:var(--ds-surface)] px-1">{slug}</code> to confirm:
            <Input value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} className="mt-1 w-full" autoComplete="off" />
          </label>
          <label className="block text-sm text-[color:var(--ds-ink)]">
            Your superadmin password:
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full" autoComplete="current-password" />
          </label>
          {footprint.large && (
            <label className="block text-sm font-semibold text-[color:var(--ds-ink)]">
              This company has real data. Type <code className="ds-num rounded bg-[color:var(--ds-surface)] px-1">PERMANENTLY DELETE</code>:
              <Input value={phrase} onChange={(e) => setPhrase(e.target.value)} className="mt-1 w-full" autoComplete="off" />
            </label>
          )}
          <Button
            size="sm"
            disabled={busy || confirmSlug !== slug || !password || (footprint.large && phrase !== "PERMANENTLY DELETE")}
            onClick={async () => {
              if (await call("DELETE", { confirmSlug, password, phrase })) {
                router.push("/superadmin");
                router.refresh();
              }
            }}
            className="!bg-[color:var(--ds-bad)]"
          >
            {busy ? "Deleting…" : "Permanently delete this account"}
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-[color:var(--ds-bad)]">{error}</p>}
    </Card>
  );
}
