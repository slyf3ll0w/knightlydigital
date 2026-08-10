"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Loader2 } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

/**
 * On-site completion sign-off: the tech hands the client the phone, the
 * client types their name (same typed-signature convention as quote
 * approval). Proof-of-completion for disputes — and a professional close to
 * the visit.
 */
export default function CollectSignature({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function sign() {
    if (!name.trim()) {
      setError("Type your full name to sign.");
      return;
    }
    setBusy(true);
    setError("");
    const res = await fetch(`/api/app/jobs/${jobId}/signature`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signatureName: name.trim() }),
    });
    const data = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setError(data?.error ?? "Couldn't save the signature. Please try again.");
      return;
    }
    hapticImpact();
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-sm font-medium text-gray-700 rounded-[10px] hover:bg-gray-50 transition-colors"
      >
        <PenLine size={13} />
        Collect Signature
      </button>

      {open && (
        <div className="modal-pop fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => !busy && setOpen(false)} />
          <div className="modal-card relative w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-gray-900 mb-1">Sign off on this job</h3>
            <p className="text-sm text-gray-500 mb-4">
              Hand the phone to your client — typing their name confirms the work is
              complete to their satisfaction.
            </p>
            {error && (
              <p className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                {error}
              </p>
            )}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Client's full name"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[16px] sm:text-sm italic focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={sign}
                disabled={busy}
                className="flex-1 py-2.5 text-sm font-semibold rounded-[10px] bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Sign &amp; Confirm
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-4 py-2.5 text-sm font-medium border border-gray-300 rounded-[10px] text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
