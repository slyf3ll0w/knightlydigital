"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Copy, Mail, Loader2, Check, RotateCcw } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { confirmSheet } from "@/components/ConfirmSheet";

/**
 * Client-portal access controls on the contact page: open it, copy the link,
 * or email the link to the client (their "login" — see /portal/[slug] for
 * the self-serve version).
 */
export default function PortalAccessCard({
  contactId,
  hubUrl,
  hasEmail,
  lastVisitLabel,
  canReset = false,
}: {
  contactId: string;
  hubUrl: string;
  hasEmail: boolean;
  /** shortDate of Contact.hubLastVisitAt — null until the client first opens their hub */
  lastVisitLabel?: string | null;
  /** Managers may rotate the link (it's the client's login). */
  canReset?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  async function resetLink() {
    const ok = await confirmSheet({
      title: "Reset the portal link?",
      message:
        "Every link this client has today stops working immediately. You'll need to send them the new one.",
      confirmLabel: "Reset Link",
      destructive: true,
    });
    if (!ok) return;
    setResetting(true);
    setError("");
    try {
      const res = await fetch(`/api/app/contacts/${contactId}/portal-reset`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't reset the link.");
        return;
      }
      router.refresh();
    } finally {
      setResetting(false);
    }
  }

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
    <div className="ds-card p-4">
      <SectionHeader
        title="Client portal"
        className="mb-3"
        hint={
          <>
            The client can view quotes, approve work, see scheduled visits, and pay invoices from
            their portal.
            {lastVisitLabel && (
              <span className="mt-1 block font-medium text-[color:var(--ds-primary)]">
                Last visited {lastVisitLabel}
              </span>
            )}
          </>
        }
      />
      <div className="space-y-2">
        <a
          href={hubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-sm text-[color:var(--ds-primary)] hover:underline font-medium"
        >
          <ExternalLink size={13} />
          Open client portal
        </a>
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 text-sm text-[color:var(--ds-primary)] hover:underline font-medium"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied!" : "Copy portal link"}
        </button>
        <button
          onClick={emailAccess}
          disabled={busy || !hasEmail}
          title={hasEmail ? undefined : "Add an email address to this client first"}
          className="flex items-center gap-1.5 text-sm text-[color:var(--ds-primary)] hover:underline font-medium disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : sent ? <Check size={13} /> : <Mail size={13} />}
          {sent ? "Email sent!" : "Email portal access"}
        </button>
        {canReset && (
          <button
            onClick={resetLink}
            disabled={resetting}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-[color:var(--ds-bad)] hover:underline font-medium disabled:text-gray-400"
          >
            {resetting ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Reset portal link
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-[color:var(--ds-bad)]">{error}</p>}
    </div>
  );
}
