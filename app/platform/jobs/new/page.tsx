"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO } from "@/lib/statuses";

type Contact = { id: string; firstName: string; lastName: string; address: string | null };
type TeamUser = { id: string; name: string; isActive: boolean };

function NewJobForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledContactId = searchParams.get("contactId") ?? "";
  const requestId = searchParams.get("requestId") ?? "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [team, setTeam] = useState<TeamUser[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    contactId: prefilledContactId,
    requestId,
    title: "",
    description: "",
    leadSource: "",
    scheduledAt: "",
    scheduledEnd: "",
    address: "",
  });

  useEffect(() => {
    fetch("/api/app/contacts")
      .then((r) => r.json())
      .then(setContacts)
      .catch(() => {});
    // Team list is manager-only; non-managers just don't see the assign section
    fetch("/api/app/team")
      .then((r) => (r.ok ? r.json() : []))
      .then((users: TeamUser[]) =>
        setTeam(Array.isArray(users) ? users.filter((u) => u.isActive) : [])
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (form.contactId) {
      const c = contacts.find((c) => c.id === form.contactId);
      if (c?.address) set("address", c.address);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.contactId, contacts]);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.contactId) {
      setError("Please select a contact.");
      return;
    }
    setError("");
    setLoading(true);

    const { ok, data } = await postJson<{ id: string }>("/api/app/jobs", {
      ...form,
      scheduledAt: localInputToISO(form.scheduledAt),
      scheduledEnd: localInputToISO(form.scheduledEnd),
      assigneeIds,
    });
    setLoading(false);

    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }

    router.push(`/app/jobs/${data.id}`);
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/app/jobs" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">New Job</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Job Details</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
            <select
              value={form.contactId}
              onChange={(e) => set("contactId", e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a customer...</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
            <Link href="/app/contacts/new" className="text-xs text-green-600 hover:underline mt-1 inline-block">
              + Add new customer
            </Link>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job title *</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. AC tune-up, Lawn maintenance, Roof inspection"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              placeholder="Details about the job, scope, special instructions..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lead source</label>
            <input
              type="text"
              list="lead-sources"
              value={form.leadSource}
              onChange={(e) => set("leadSource", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Where did this job come from?"
            />
            <datalist id="lead-sources">
              <option value="Google" />
              <option value="Referral" />
              <option value="Online booking" />
              <option value="Facebook" />
              <option value="Nextdoor" />
              <option value="Yard sign" />
              <option value="Repeat client" />
              <option value="Door hanger" />
            </datalist>
            <p className="text-xs text-gray-400 mt-1">
              Used in Insights to show which sources bring in the most revenue.
            </p>
          </div>
        </div>

        <div className="card-ledger p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Scheduling</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start</label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => set("scheduledAt", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End</label>
              <input
                type="datetime-local"
                value={form.scheduledEnd}
                onChange={(e) => set("scheduledEnd", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>

          {team.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
              <div className="space-y-1.5">
                {team.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 text-sm text-gray-700 select-none w-fit"
                  >
                    <input
                      type="checkbox"
                      checked={assigneeIds.includes(u.id)}
                      onChange={() =>
                        setAssigneeIds((ids) =>
                          ids.includes(u.id) ? ids.filter((x) => x !== u.id) : [...ids, u.id]
                        )
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    {u.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Assigned techs see this job on their schedule, and their online-booking
                availability blocks off this time.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job site address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set("address", e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="Defaults to customer address"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 chamfer bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Create Job
          </button>
          <Link
            href="/app/jobs"
            className="px-5 py-2.5 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function NewJobPage() {
  return (
    <Suspense>
      <NewJobForm />
    </Suspense>
  );
}
