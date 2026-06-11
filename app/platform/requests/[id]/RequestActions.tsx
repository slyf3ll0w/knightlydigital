"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, FileText, Briefcase, Archive, Trash2 } from "lucide-react";

export default function RequestActions({
  requestId,
  status,
  contactId,
}: {
  requestId: string;
  status: string;
  contactId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
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
    try {
      await fetch(`/api/app/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="flex items-center gap-2" ref={ref}>
      {status === "NEW" && (
        <button
          onClick={() =>
            router.push(`/app/quotes/new?contactId=${contactId}&requestId=${requestId}`)
          }
          className="px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors"
        >
          Convert to Quote
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
          <div className="absolute right-0 top-full mt-1 z-30 w-52 bg-white rounded-lg shadow-xl border border-gray-200 py-1.5">
            <button
              onClick={() =>
                router.push(`/app/quotes/new?contactId=${contactId}&requestId=${requestId}`)
              }
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileText size={14} className="text-gray-400" />
              Convert to Quote
            </button>
            <button
              onClick={() =>
                router.push(`/app/jobs/new?contactId=${contactId}&requestId=${requestId}`)
              }
              className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <Briefcase size={14} className="text-gray-400" />
              Convert to Job
            </button>
            <div className="my-1 border-t border-gray-100" />
            {status !== "ARCHIVED" ? (
              <button
                onClick={() => setStatus("ARCHIVED")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Archive size={14} className="text-gray-400" />
                Archive
              </button>
            ) : (
              <button
                onClick={() => setStatus("NEW")}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Trash2 size={14} className="text-gray-400" />
                Restore to New
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
