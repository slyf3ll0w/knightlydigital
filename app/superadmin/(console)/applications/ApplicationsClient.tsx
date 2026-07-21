"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, X } from "lucide-react";

type Application = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  companyName: string;
  industry: string | null;
  teamSize: string | null;
  website: string | null;
  message: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  decidedAt: string | null;
  inviteCode: { code: string; used: boolean } | null;
};

const statusChip: Record<Application["status"], string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-green-100 text-green-700",
  REJECTED: "bg-gray-200 text-gray-600",
};

export default function ApplicationsClient({ applications }: { applications: Application[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  const pending = applications.filter((a) => a.status === "PENDING");
  const decided = applications.filter((a) => a.status !== "PENDING");

  async function decide(id: string, action: "approve" | "reject") {
    if (action === "reject" && !confirm("Reject this application? No email is sent.")) return;
    setError("");
    setBusy(id);
    try {
      const res = await fetch(`/api/superadmin/applications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      if (action === "approve" && data.emailed === false) {
        setError(
          `Approved and code ${data.code} was created, but the email failed to send — copy it from the Invite codes tab and send it yourself.`
        );
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(""), 1500);
  }

  function Card({ app }: { app: Application }) {
    const rows: [string, string | null][] = [
      ["Contact", `${app.name} — ${app.email}${app.phone ? ` — ${app.phone}` : ""}`],
      ["Trade", app.industry],
      ["Team size", app.teamSize],
      ["Website", app.website],
      ["Notes", app.message],
    ];
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-gray-900">{app.companyName}</h3>
            <p className="text-xs text-gray-400">
              Applied {new Date(app.createdAt).toLocaleDateString()}
              {app.decidedAt ? ` · decided ${new Date(app.decidedAt).toLocaleDateString()}` : ""}
            </p>
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusChip[app.status]}`}>
            {app.status.charAt(0) + app.status.slice(1).toLowerCase()}
          </span>
        </div>
        <dl className="mt-3 space-y-1.5">
          {rows.map(
            ([label, value]) =>
              value && (
                <div key={label} className="flex gap-2 text-sm">
                  <dt className="w-20 shrink-0 text-gray-400">{label}</dt>
                  <dd className="min-w-0 break-words text-gray-700">{value}</dd>
                </div>
              )
          )}
        </dl>
        {app.status === "PENDING" && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => decide(app.id, "approve")}
              disabled={busy === app.id}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
            >
              {busy === app.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Approve &amp; email code
            </button>
            <button
              onClick={() => decide(app.id, "reject")}
              disabled={busy === app.id}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <X size={14} /> Reject
            </button>
          </div>
        )}
        {app.status === "APPROVED" && app.inviteCode && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="rounded-lg bg-gray-100 px-3 py-1.5 font-mono font-semibold tracking-wider text-gray-800">
              {app.inviteCode.code}
            </span>
            <button
              onClick={() => copy(app.inviteCode!.code)}
              className="inline-flex items-center gap-1 text-gray-400 hover:text-gray-600"
              title="Copy code"
            >
              {copied === app.inviteCode.code ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
            </button>
            <span className="text-xs text-gray-400">
              {app.inviteCode.used ? "Used — they signed up" : "Not used yet"}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900">Access applications</h1>
      <p className="mt-1 text-sm text-gray-500">
        Approving emails the applicant a single-use invite code for the signup page.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {pending.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-400">
            No pending applications.
          </p>
        )}
        {pending.map((app) => (
          <Card key={app.id} app={app} />
        ))}
      </div>

      {decided.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-gray-400">
            Decided
          </h2>
          <div className="mt-3 space-y-3">
            {decided.map((app) => (
              <Card key={app.id} app={app} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
