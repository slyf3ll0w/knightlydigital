"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/** One note bubble in the client's Notes & Activity feed, with inline
 * edit (author) and delete (author or manager). */
export default function ContactNoteItem({
  contactId,
  note,
  canEdit,
  canDelete,
}: {
  contactId: string;
  note: { id: string; body: string; userName: string; createdAtLabel: string };
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/contacts/${contactId}/notes/${note.id}`,
      { body: text },
      "PATCH"
    );
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Delete this note?")) return;
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/contacts/${contactId}/notes/${note.id}`,
      undefined,
      "DELETE"
    );
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex gap-3 group">
      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
        {note.userName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 bg-gray-50 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-gray-700">{note.userName}</span>
          <span className="text-xs text-gray-400">{note.createdAtLabel}</span>
          {!editing && (
            <span className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {canEdit && (
                <button
                  onClick={() => {
                    setText(note.body);
                    setError("");
                    setEditing(true);
                  }}
                  title="Edit note"
                  className="p-1 text-gray-400 hover:text-gray-600 rounded"
                >
                  <Pencil size={12} />
                </button>
              )}
              {canDelete && (
                <button
                  onClick={remove}
                  disabled={busy}
                  title="Delete note"
                  className="p-1 text-gray-400 hover:text-red-600 rounded"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              autoFocus
              className="w-full px-2.5 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none bg-white"
            />
            <div className="flex items-center gap-1.5 mt-1.5">
              <button
                onClick={save}
                disabled={busy || !text.trim()}
                className="flex items-center gap-1 px-2.5 py-1 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded transition-colors disabled:opacity-40"
              >
                {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 rounded"
              >
                <X size={11} />
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.body}</p>
        )}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    </div>
  );
}
