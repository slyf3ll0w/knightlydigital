"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { postJson } from "@/lib/safe-fetch";

export default function ContactNoteForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { ok, data } = await postJson(`/api/app/contacts/${contactId}/notes`, { body });
      if (!ok) {
        setError(data?.error ?? "Couldn't save the note — try again.");
        return;
      }
      setBody("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add a note..."
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)] resize-none"
        />
        <button
          type="submit"
          disabled={loading || !body.trim()}
          className="btn-primary shrink-0"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </button>
      </form>
      {error && <p className="text-xs text-[color:var(--ds-bad)] mt-1.5">{error}</p>}
    </div>
  );
}
