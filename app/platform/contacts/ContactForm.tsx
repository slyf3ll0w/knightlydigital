"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, ArrowLeft } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

type FieldDef = {
  id: string;
  label: string;
  type: string;
  options: string[];
  required: boolean;
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

export type ContactFormInitial = {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  leadSource: string;
  paymentTermsDays: number;
  status: string;
  customFields: Record<string, string>;
};

/**
 * One client form for both create (/app/contacts/new → POST) and edit
 * (/app/contacts/[id]/edit → PATCH). Assignment shows on create only —
 * on the detail page it lives in the "Assigned to" rail card.
 */
export default function ContactForm({
  mode,
  contactId,
  initial,
  canAssign = false,
  users = [],
}: {
  mode: "create" | "edit";
  contactId?: string;
  initial?: Partial<ContactFormInitial>;
  canAssign?: boolean;
  users?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    firstName: initial?.firstName ?? "",
    lastName: initial?.lastName ?? "",
    companyName: initial?.companyName ?? "",
    email: initial?.email ?? "",
    phone: initial?.phone ?? "",
    address: initial?.address ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    zip: initial?.zip ?? "",
    notes: initial?.notes ?? "",
    leadSource: initial?.leadSource ?? "",
    paymentTermsDays: String(initial?.paymentTermsDays ?? 30),
    status: initial?.status ?? "LEAD",
    assignedToId: "",
  });
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string>>(
    initial?.customFields ?? {}
  );

  useEffect(() => {
    fetch("/api/app/contact-fields")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setFieldDefs(d))
      .catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const backHref = mode === "edit" ? `/app/contacts/${contactId}` : "/app/contacts";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const missing = fieldDefs.find((d) => d.required && !(customFields[d.id] ?? "").trim());
    if (missing) {
      setError(`"${missing.label}" is required.`);
      return;
    }

    const terms = parseInt(form.paymentTermsDays, 10);
    if (isNaN(terms) || terms < 0 || terms > 365) {
      setError("Payment terms must be between 0 and 365 days.");
      return;
    }

    setLoading(true);

    const payload: Record<string, unknown> = {
      firstName: form.firstName,
      lastName: form.lastName,
      companyName: form.companyName,
      email: form.email,
      phone: form.phone,
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      notes: form.notes,
      leadSource: form.leadSource,
      paymentTermsDays: terms,
      customFields,
    };

    if (mode === "create") {
      if (canAssign && form.assignedToId) payload.assignedToId = form.assignedToId;
      const { ok, data } = await postJson<{ id: string }>("/api/app/contacts", payload);
      setLoading(false);
      if (!ok || !data?.id) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      router.push(`/app/contacts/${data.id}`);
    } else {
      payload.status = form.status;
      payload.replaceCustomFields = true;
      const { ok, data } = await postJson(`/api/app/contacts/${contactId}`, payload, "PATCH");
      setLoading(false);
      if (!ok) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      router.push(`/app/contacts/${contactId}`);
      router.refresh();
    }
  }

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={backHref} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">
          {mode === "create" ? "New Client" : "Edit Client"}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="card-ledger p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Contact Info
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First name *</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last name *</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Company (optional)</label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => set("companyName", e.target.value)}
                placeholder="If this client is a business"
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        <div className="card-ledger p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Address
          </h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Street address</label>
              <input
                type="text"
                value={form.address}
                onChange={(e) => set("address", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                placeholder="123 Main St"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <select
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">—</option>
                  {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
              <input
                type="text"
                value={form.zip}
                onChange={(e) => set("zip", e.target.value)}
                maxLength={10}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        </div>

        <div className="card-ledger p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
            Client Details
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lead source</label>
              <input
                type="text"
                value={form.leadSource}
                onChange={(e) => set("leadSource", e.target.value)}
                placeholder="Referral, Google, yard sign..."
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment terms (days)</label>
              <input
                type="number"
                min={0}
                max={365}
                value={form.paymentTermsDays}
                onChange={(e) => set("paymentTermsDays", e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 mt-1">Invoices due Net {form.paymentTermsDays || "30"}</p>
            </div>
            {mode === "edit" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="LEAD">Lead</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            )}
            {mode === "create" && canAssign && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assign to</label>
                <select
                  value={form.assignedToId}
                  onChange={(e) => set("assignedToId", e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Me</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {fieldDefs.length > 0 && (
          <div className="card-ledger p-5">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Custom Fields
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {fieldDefs.map((d) => (
                <div key={d.id}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {d.label}
                    {d.required && " *"}
                  </label>
                  {d.type === "SELECT" ? (
                    <select
                      value={customFields[d.id] ?? ""}
                      onChange={(e) => setCustomFields({ ...customFields, [d.id]: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">—</option>
                      {d.options.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={d.type === "NUMBER" ? "number" : d.type === "DATE" ? "date" : "text"}
                      value={customFields[d.id] ?? ""}
                      onChange={(e) => setCustomFields({ ...customFields, [d.id]: e.target.value })}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card-ledger p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Notes</h2>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            placeholder="Any notes about this customer..."
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === "create" ? "Save Client" : "Save Changes"}
          </button>
          <Link
            href={backHref}
            className="px-5 py-2.5 border border-gray-300 text-sm font-medium text-gray-600 rounded hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
