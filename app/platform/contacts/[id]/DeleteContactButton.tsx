"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

/**
 * Spam/marketer cleanup: permanently removes the contact and their requests.
 * The API refuses when real work (quotes, jobs, billing) exists.
 */
export default function DeleteContactButton({ contactId }: { contactId: string }) {
  const router = useRouter();

  async function deleteContact() {
    if (!confirm("Permanently delete this client and their requests? This can't be undone.")) {
      return;
    }
    const res = await fetch(`/api/app/contacts/${contactId}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Couldn't delete this client.");
      return;
    }
    router.push("/app/contacts");
    router.refresh();
  }

  return (
    <button
      onClick={deleteContact}
      title="Delete (spam)"
      className="p-2 border border-gray-300 rounded text-gray-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors"
    >
      <Trash2 size={16} />
    </button>
  );
}
