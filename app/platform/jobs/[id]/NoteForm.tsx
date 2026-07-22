"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";

export default function NoteForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);

    await fetch(`/api/app/jobs/${jobId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });

    setBody("");
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="Add a note..."
        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
      />
      <button
        type="submit"
        disabled={loading || !body.trim()}
        className="px-3 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white rounded-[10px] btn-tool transition-colors disabled:opacity-40 shrink-0"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      </button>
    </form>
  );
}
