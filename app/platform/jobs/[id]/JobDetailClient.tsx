"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronRight } from "lucide-react";

export default function JobDetailClient({
  jobId,
  nextStatus,
  nextLabel,
}: {
  jobId: string;
  nextStatus: string;
  nextLabel: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function advance() {
    setLoading(true);
    await fetch(`/api/app/jobs/${jobId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <button
      onClick={advance}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
    >
      {loading ? <Loader2 size={13} className="animate-spin" /> : <ChevronRight size={13} />}
      Mark {nextLabel}
    </button>
  );
}
