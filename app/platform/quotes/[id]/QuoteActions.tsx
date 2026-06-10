"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal,
  Send,
  CheckCircle,
  Briefcase,
  Eye,
  Archive,
  Trash2,
  Copy,
  Loader2,
} from "lucide-react";

export default function QuoteActions({
  quoteId,
  status,
  publicUrl,
  hasJob,
}: {
  quoteId: string;
  status: string;
  publicUrl: string;
  hasJob: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function setStatus(newStatus: string) {
    setOpen(false);
    setBusy(true);
    await fetch(`/api/app/quotes/${quoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setBusy(false);
    router.refresh();
  }

  async function convertToJob() {
    setOpen(false);
    setBusy(true);
    const res = await fetch(`/api/app/quotes/${quoteId}/convert`, { method: "POST" });
    const data = await res.json();
    setBusy(false);
    if (res.ok) router.push(`/app/jobs/${data.id}`);
    else router.refresh();
  }

  async function deleteQuote() {
    if (!confirm("Delete this quote? This cannot be undone.")) return;
    setOpen(false);
    const res = await fetch(`/api/app/quotes/${quoteId}`, { method: "DELETE" });
    if (res.ok) router.push("/app/quotes");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {/* Primary action follows the lifecycle (Jobber behavior) */}
      {status === "DRAFT" && (
        <button
          onClick={() => setStatus("AWAITING_RESPONSE")}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Send size={13} />
          Mark as Sent
        </button>
      )}
      {(status === "AWAITING_RESPONSE" || status === "CHANGES_REQUESTED") && (
        <button
          onClick={() => setStatus("APPROVED")}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <CheckCircle size={13} />
          Mark Approved
        </button>
      )}
      {status === "APPROVED" && !hasJob && (
        <button
          onClick={convertToJob}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors"
        >
          <Briefcase size={13} />
          Convert to Job
        </button>
      )}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="p-2 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <MoreHorizontal size={16} />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1 z-30 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5">
            <a
              href={`${publicUrl}?preview=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Eye size={14} className="text-gray-400" />
              Preview as Client
            </a>
            <button
              onClick={copyLink}
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Copy size={14} className="text-gray-400" />
              {copied ? "Copied!" : "Copy client link"}
            </button>
            <div className="my-1 border-t border-gray-100" />
            {status !== "APPROVED" && status !== "CONVERTED" && (
              <button
                onClick={() => setStatus("APPROVED")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <CheckCircle size={14} className="text-gray-400" />
                Mark as... Approved
              </button>
            )}
            {status === "APPROVED" && !hasJob && (
              <button
                onClick={convertToJob}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Briefcase size={14} className="text-gray-400" />
                Convert to Job
              </button>
            )}
            {status !== "ARCHIVED" && status !== "CONVERTED" && (
              <button
                onClick={() => setStatus("ARCHIVED")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Archive size={14} className="text-gray-400" />
                Archive
              </button>
            )}
            {status !== "CONVERTED" && (
              <button
                onClick={deleteQuote}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
