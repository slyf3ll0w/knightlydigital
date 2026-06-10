"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, CreditCard, Loader2, Copy, Check } from "lucide-react";

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
  const [loading, setLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function markSent() {
    setLoading("send");
    await fetch(`/api/app/invoices/${invoiceId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SENT" }),
    });
    setLoading(null);
    router.refresh();
  }

  async function markPaid() {
    setLoading("paid");
    await fetch(`/api/app/invoices/${invoiceId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "OTHER" }),
    });
    setLoading(null);
    router.refresh();
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {status === "DRAFT" && (
        <button
          onClick={markSent}
          disabled={!!loading}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {loading === "send" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Mark Sent
        </button>
      )}
      {(status === "SENT" || status === "OVERDUE") && (
        <>
          <button
            onClick={copyLink}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm font-medium text-gray-700 rounded hover:bg-gray-50 transition-colors"
          >
            {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
            {copied ? "Copied!" : "Copy Link"}
          </button>
          <button
            onClick={markPaid}
            disabled={!!loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
          >
            {loading === "paid" ? <Loader2 size={13} className="animate-spin" /> : <CreditCard size={13} />}
            Record Payment
          </button>
        </>
      )}
    </div>
  );
}
