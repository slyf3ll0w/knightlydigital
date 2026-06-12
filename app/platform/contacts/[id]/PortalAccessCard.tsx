"use client";

import { useState } from "react";
import { ExternalLink, Copy, Mail, Loader2, Check } from "lucide-react";

/**
 * Client-portal access controls on the contact page: open it, copy the link,
 * or email the link to the client (their "login" — see /portal/[slug] for
 * the self-serve version).
 */
export default function PortalAccessCard({
  contactId,
  hubUrl,
  hasEmail,
}: {
  contactId: string;
  hubUrl: string;
  hasEmail: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function copyLink() {
    await navigator.clipboard.writeText(hubUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function emailAccess() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/app/contacts/${contactId}/portal-invite`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send the email.");
        return;
      }
      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-ledger p-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Client portal
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        The client can view quotes, approve work, see scheduled visits, and pay invoices from
        their portal.
      </p>
      <div className="space-y-2">
        <a
          href={hubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-green-600 hover:underline font-medium"
        >
          <ExternalLink size={13} />
          Open client portal
        </a>
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 text-sm text-green-600 hover:underline font-medium"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy portal link"}
        </button>
        <button
          onClick={emailAccess}
          disabled={busy || !hasEmail}
          title={hasEmail ? undefined : "Add an email address to this client first"}
          className="flex items-center gap-1.5 text-sm text-green-600 hover:underline font-medium disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : sent ? <Check size={13} /> : <Mail size={13} />}
          {sent ? "Email sent!" : "Email portal access"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
