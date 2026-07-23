"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail, Loader2, X } from "lucide-react";

/**
 * "Email" action on the contact header — compose a one-off professional
 * message. The client gets a branded email with a "Read message" button
 * (body lives on the public message page so the open is tracked), and their
 * reply comes back to the company inbox as a normal email.
 */
export default function EmailClientButton({
  contactId,
  contactName,
  contactEmail,
  signature: defaultSignature,
  hasLogo,
}: {
  contactId: string;
  contactName: string;
  contactEmail: string;
  /** Sender's saved signature (or the generated default) — editable per email */
  signature: string;
  /** Company has a logo to offer under the signature */
  hasLogo: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [signature, setSignature] = useState(defaultSignature);
  const [includeLogo, setIncludeLogo] = useState(hasLogo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function close() {
    if (busy) return;
    setOpen(false);
    setError("");
  }

  async function send() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/app/contacts/${contactId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, signature, includeLogo }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send the message. Please try again.");
        return;
      }
      setOpen(false);
      setSubject("");
      setBody("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
      >
        <Mail size={14} />
        Email
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
          onClick={close}
        >
          <div
            className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-xl shadow-xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-gray-900">Email {contactName}</h2>
                <p className="text-xs text-gray-500 truncate">
                  To {contactEmail} — they can reply straight back to your inbox
                </p>
              </div>
              <button onClick={close} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={150}
                placeholder="Quick update on your project"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={7}
                maxLength={10000}
                placeholder={`Hi ${contactName.split(" ")[0]},\n\n…`}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
              />
              <p className="text-xs text-gray-400 mt-1">
                Sent as a plain email — you&apos;ll get a notification when they open it.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Signature</label>
              <textarea
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-y"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                {hasLogo ? (
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={includeLogo}
                      onChange={(e) => setIncludeLogo(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    Include company logo under the signature
                  </label>
                ) : (
                  <span className="text-xs text-gray-400">
                    Add a logo in Settings → Branding to include it here.
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  Save a default in Settings → My Profile
                </span>
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={close}
                disabled={busy}
                className="px-4 py-2 btn-tool-line bg-white text-sm font-semibold text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={send}
                disabled={busy || !subject.trim() || !body.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-40"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Send email
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
