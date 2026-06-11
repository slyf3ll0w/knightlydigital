"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  DollarSign,
  Loader2,
  Copy,
  MoreHorizontal,
  Eye,
  RotateCcw,
} from "lucide-react";

export default function InvoiceActions({
  invoiceId,
  status,
  publicUrl,
}: {
  invoiceId: string;
  status: string;
  publicUrl: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
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
    try {
      await fetch(`/api/app/invoices/${invoiceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center gap-2 shrink-0" ref={ref}>
      {busy && <Loader2 size={16} className="animate-spin text-gray-400" />}

      {status === "DRAFT" && (
        <button
          onClick={() => setStatus("AWAITING_PAYMENT")}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <Send size={13} />
          Mark as Sent
        </button>
      )}
      {(status === "AWAITING_PAYMENT" || status === "PAST_DUE") && (
        <button
          onClick={() => router.push(`/app/payments/new?invoiceId=${invoiceId}`)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          <DollarSign size={13} />
          Collect Payment
        </button>
      )}
      {status === "PAID" && (
        <button
          onClick={() => setStatus("AWAITING_PAYMENT")}
          className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors"
        >
          <RotateCcw size={13} />
          Re-open Invoice
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
              href={publicUrl}
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
              {copied ? "Copied!" : "Copy payment link"}
            </button>
            {status !== "PAID" && (
              <>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={() => router.push(`/app/payments/new?invoiceId=${invoiceId}`)}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <DollarSign size={14} className="text-gray-400" />
                  Collect Payment
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
