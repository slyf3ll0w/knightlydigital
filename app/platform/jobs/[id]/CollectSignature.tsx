"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Loader2 } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";
import { sendOrQueue } from "@/lib/outbox";
import Modal from "@/components/Modal";

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
  const [queued, setQueued] = useState(false);

  async function sign() {
    if (!name.trim()) {
      setError("Type your full name to sign.");
      return;
    }
    setBusy(true);
    setError("");
    // Offline sign-off queues and replays on reconnect (the route treats a
    // same-name replay as success, so the flush can't double-error)
    const res = await sendOrQueue({
      url: `/api/app/jobs/${jobId}/signature`,
      body: { signatureName: name.trim() },
      label: "Job sign-off",
    });
    setBusy(false);
    if (res.queued) {
      hapticImpact();
      setQueued(true);
      setOpen(false);
      return;
    }
    if (!res.ok) {
      setError(res.data?.error ?? "Couldn't save the signature. Please try again.");
      return;
    }
    hapticImpact();
    setOpen(false);
    router.refresh();
  }

  if (queued) {
    return (
      <p className="text-xs text-[color:var(--ds-warn)]">
        Signed — the sign-off will sync when you&apos;re back online.
      </p>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ds-btn ds-btn-outline"
      >
        <PenLine size={13} />
        Collect Signature
      </button>

      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        size="sm"
      >
        {open && (
          <>
            <h3 className="text-base font-bold text-gray-900 mb-1">Sign off on this job</h3>
            <p className="text-sm text-gray-500 mb-4">
              Hand the phone to your client — typing their name confirms the work is
              complete to their satisfaction.
            </p>
            {error && (
              <p role="alert" className="form-error mb-3">
                {error}
              </p>
            )}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="Client's full name"
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-[16px] sm:text-sm italic focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={sign}
                disabled={busy}
                className="btn-primary btn-lg flex-1 justify-center"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Sign &amp; Confirm
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={busy}
                className="ds-btn ds-btn-outline ds-btn-lg"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
