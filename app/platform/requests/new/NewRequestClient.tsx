"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import ContactPicker from "@/components/ContactPicker";
import ServiceChips, { type ServiceLite } from "@/components/ServiceChips";
import { titleFromServices } from "@/lib/service-title";

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
  // Tap-to-pick services name the request until a title is typed
  const [services, setServices] = useState<ServiceLite[]>([]);
  const [titleTouched, setTitleTouched] = useState(false);

  function toggleService(w: ServiceLite) {
    const next = services.some((s) => s.id === w.id) ? services.filter((s) => s.id !== w.id) : [...services, w];
    setServices(next);
    if (!titleTouched) set("title", titleFromServices(next.map((s) => s.name)));
  }

  useEffect(() => {
    // A 401/403 body isn't a list — `contacts.find` used to throw on it
    fetch("/api/app/contacts")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Contact[]) => setContacts(Array.isArray(list) ? list : []))
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
    const title = form.title.trim() || titleFromServices(services.map((s) => s.name));
    if (!title) {
      setError("Pick a service, or type what the client needs.");
      return;
    }
    setError("");
    setLoading(true);

    const { ok, data } = await postJson<{ id: string }>("/api/app/requests", { ...form, title });
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
        <BackLink href="/app/requests" />
        <PageTitle>New Request</PageTitle>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        <div className="ds-card p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Overview</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
            <ContactPicker
              contacts={contacts}
              value={form.contactId}
              onChange={(id) => set("contactId", id)}
            />
            <Link
              href="/app/contacts/new"
              className="text-xs text-[color:var(--ds-primary)] hover:underline mt-1 inline-block"
            >
              + Add new client
            </Link>
          </div>

          <ServiceChips selectedIds={services.map((s) => s.id)} onToggle={toggleService} label="What they need" />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title <span className="text-xs font-normal text-gray-400">(optional when a service is picked)</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => {
                set("title", e.target.value);
                setTitleTouched(e.target.value.trim().length > 0);
              }}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              placeholder="e.g. Driveway and patio pressure wash"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service details</label>
            <textarea
              value={form.details}
              onChange={(e) => set("details", e.target.value)}
              rows={4}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)] resize-none"
              placeholder="Please provide as much information as you can..."
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-lg"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Save Request
          </button>
          <Link
            href="/app/requests"
            className="px-5 py-2.5 btn-tool-line bg-white text-sm font-medium text-gray-600 rounded-[10px] hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

// Rendered by the server page.tsx next door, which gates the role first
export default function NewRequestClient() {
  return (
    <Suspense>
      <NewRequestForm />
    </Suspense>
  );
}
