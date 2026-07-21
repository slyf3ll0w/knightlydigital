"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, Link2, Loader2, Plus } from "lucide-react";

type Invite = {
  id: string;
  code: string;
  note: string | null;
  email: string | null;
  createdAt: string;
  expiresAt: string | null;
  usedAt: string | null;
  revokedAt: string | null;
  usedByCompany: string | null;
  applicationCompany: string | null;
};

function inviteStatus(i: Invite): { label: string; chip: string } {
  if (i.usedAt) return { label: "Used", chip: "bg-green-100 text-green-700" };
  if (i.revokedAt) return { label: "Revoked", chip: "bg-gray-200 text-gray-600" };
  if (i.expiresAt && new Date(i.expiresAt) < new Date())
    return { label: "Expired", chip: "bg-gray-200 text-gray-600" };
  return { label: "Active", chip: "bg-blue-100 text-blue-700" };
}

export default function InvitesClient({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [sendNow, setSendNow] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("30");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const res = await fetch("/api/superadmin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          email,
          sendEmail: sendNow,
          expiresInDays: Number(expiresInDays),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (sendNow && data.emailed === false) {
        setError(`Code ${data.code} was created but the email failed to send — copy it below.`);
      }
      setNote("");
      setEmail("");
      setSendNow(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this code? It can no longer be used to sign up.")) return;
    setError("");
    setBusy(id);
    try {
      const res = await fetch(`/api/superadmin/invites/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Something went wrong.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500";

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Invite codes</h1>
      <p className="mt-1 text-sm text-gray-500">
        Every code authorizes exactly one company signup at{" "}
        <span className="font-mono text-xs">/app/register</span>.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Mint a new code */}
      <form onSubmit={create} className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-gray-900">New invite code</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Who's it for? (memo)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              className={inputClass}
              placeholder="Joe's Plumbing — met at expo"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Email (optional)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={254}
              className={inputClass}
              placeholder="joe@joesplumbing.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Expires</label>
            <select
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              className={`${inputClass} bg-white`}
            >
              <option value="7">In 7 days</option>
              <option value="30">In 30 days</option>
              <option value="90">In 90 days</option>
              <option value="0">Never</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-green-500 focus:ring-green-500"
            />
            Email the code to them now
          </label>
          <button
            type="submit"
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create code
          </button>
        </div>
      </form>

      {/* Code list */}
      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {invites.length === 0 && (
          <p className="px-5 py-8 text-center text-sm text-gray-400">No codes yet.</p>
        )}
        <ul className="divide-y divide-gray-100">
          {invites.map((invite) => {
            const status = inviteStatus(invite);
            const active = status.label === "Active";
            return (
              <li key={invite.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <span className="font-mono text-sm font-semibold tracking-wider text-gray-800">
                  {invite.code}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.chip}`}>
                  {status.label}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-gray-500">
                  {invite.usedAt && invite.usedByCompany
                    ? `Used by ${invite.usedByCompany} on ${new Date(invite.usedAt).toLocaleDateString()}`
                    : invite.note ||
                      (invite.applicationCompany ? `Application — ${invite.applicationCompany}` : "") ||
                      invite.email ||
                      ""}
                </span>
                {invite.expiresAt && !invite.usedAt && !invite.revokedAt && (
                  <span className="text-xs text-gray-400">
                    Expires {new Date(invite.expiresAt).toLocaleDateString()}
                  </span>
                )}
                <span className="flex items-center gap-2">
                  <button
                    onClick={() => copy(invite.code, invite.id)}
                    className="text-gray-400 hover:text-gray-600"
                    title="Copy code"
                  >
                    {copied === invite.id ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                  </button>
                  <button
                    onClick={() =>
                      copy(
                        `${window.location.origin}/app/register?code=${encodeURIComponent(invite.code)}`,
                        `${invite.id}-link`
                      )
                    }
                    className="text-gray-400 hover:text-gray-600"
                    title="Copy signup link (pre-fills the code)"
                  >
                    {copied === `${invite.id}-link` ? (
                      <Check size={15} className="text-green-600" />
                    ) : (
                      <Link2 size={15} />
                    )}
                  </button>
                  {active && (
                    <button
                      onClick={() => revoke(invite.id)}
                      disabled={busy === invite.id}
                      className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                      title="Revoke"
                    >
                      {busy === invite.id ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Ban size={15} />
                      )}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
