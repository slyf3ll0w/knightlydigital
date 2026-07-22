"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type Contact = { id: string; firstName: string; lastName: string };

function NewRequestForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactId = searchParams.get("contactId") ?? "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState({
    contactId: prefilledContactId,
    title: "",
    details: "",
  });

  useEffect(() => {
    fetch("/api/app/contacts")
      .then((r) => r.json())
      .then(setContacts)
      .catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactId) {
      setError("Please select a client.");
      return;
    }
    setError("");
    setLoading(true);

    const { ok, data } = await postJson<{ id: string }>("/api/app/requests", form);
    setLoading(false);

    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }

    router.push(`/app/requests/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/requests" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">New Request</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Overview</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <select
              value={form.contactId}
              onChange={(e) => set("contactId", e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a client...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
            <Link
              href="/app/contacts/new"
              className="text-xs text-green-600 hover:underline mt-1 inline-block"
            >
              + Add new client
            </Link>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. Driveway and patio pressure wash"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service details</label>
            <textarea
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Please provide as much information as you can..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-[10px] btn-tool transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Save Request
          </button>
          <Link
            href="/app/requests"
            className="px-5 py-2.5 border border-gray-300 text-sm font-medium text-gray-600 rounded-[10px] hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function NewRequestPage() {
  return (
    <Suspense>
      <NewRequestForm />
    </Suspense>
  );
}
