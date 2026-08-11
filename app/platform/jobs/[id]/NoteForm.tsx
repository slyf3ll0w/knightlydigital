"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { sendOrQueue } from "@/lib/outbox";

export default function NoteForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [queuedCount, setQueuedCount] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError("");

    // clientKey rides in the queued body so an offline note can't double-post
    const res = await sendOrQueue(
      {
        url: `/api/app/jobs/${jobId}/notes`,
        body: { body, clientKey: crypto.randomUUID() },
        label: "Job note",
      }
    );
    setLoading(false);
    if (res.queued) {
      setBody("");
      setQueuedCount((n) => n + 1);
      return;
    }
    if (!res.ok) {
      setError(res.data?.error ?? "Couldn't save the note — try again.");
      return;
    }
    setBody("");
    setQueuedCount(0);
    router.refresh();
  }

  return (
    <div className="mt-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
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
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
      {queuedCount > 0 && !error && (
        <p className="text-xs text-amber-700 mt-1.5">
          {queuedCount === 1 ? "Note saved" : `${queuedCount} notes saved`} — will send when
          you&apos;re back online.
        </p>
      )}
    </div>
  );
}
