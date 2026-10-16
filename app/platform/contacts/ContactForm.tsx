"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import PageTitle from "@/components/PageTitle";
import SectionHeader from "@/components/SectionHeader";
import UseMyLocation from "@/components/UseMyLocation";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import MoreDetails from "@/components/MoreDetails";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { formatPhoneAsTyped, splitName, titleCaseName } from "@/lib/phone-input";

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

const inputCls =
  "w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";

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
  smsConsent: boolean;
  smsConsentNote: string;
  status: string;
  /** CLIENT (leads and clients) or CONTACT (a business connection — never a lead). */
  kind: string;
  customFields: Record<string, string>;
};

/**
 * One client form for both create (/app/contacts/new → POST) and edit
 * (/app/contacts/[id]/edit → PATCH). Assignment shows on create only —
 * on the detail page it lives in the "Assigned to" rail card.
 *
 * Streamlined 2026-10-16 (David: pen-and-paper people): creating someone
 * is one Name box, a phone that formats itself, an email and an address
 * that autocompletes. Company, texting consent, lead source, payment
 * terms, assignment and notes wait behind "More details". Editing keeps
 * First / Last and shows everything, since it was all filled in once.
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
    smsConsent: initial?.smsConsent ?? true,
    smsConsentNote: initial?.smsConsentNote ?? "",
    status: initial?.status ?? "LEAD",
    kind: initial?.kind ?? "CLIENT",
    assignedToId: "",
  });
  // Create mode: one Name box ("Mike Jones" → first / last on save)
  const [name, setName] = useState(`${initial?.firstName ?? ""} ${initial?.lastName ?? ""}`.trim());
  const [fieldDefs, setFieldDefs] = useState<FieldDef[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, string>>(
    initial?.customFields ?? {}
  );
  const [more, setMore] = useState(mode === "edit");

  // Leaving with edits asks first: the form as it opened vs. as it is now,
  // off once the save went through (the redirect must not be stopped).
  const snapshot = JSON.stringify({ form, name, customFields });
  const initialSnapshot = useRef(snapshot);
  const [saved, setSaved] = useState(false);
  useUnsavedWarning(!saved && !loading && snapshot !== initialSnapshot.current);

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

    const split = mode === "create" ? splitName(titleCaseName(name)) : null;
    if (split && !split.firstName) {
      setError("Name is required.");
      return;
    }

    const missing = fieldDefs.find((d) => d.required && !(customFields[d.id] ?? "").trim());
    if (missing) {
      setError(`"${missing.label}" is required.`);
      return;
    }

    const terms = parseInt(form.paymentTermsDays, 10);
    if (isNaN(terms) || terms < 0 || terms > 365) {
      setError("Payment terms must be between 0 and 365 days.");
      setMore(true);
      return;
    }

    setLoading(true);

    const payload: Record<string, unknown> = {
      firstName: split ? split.firstName : form.firstName,
      lastName: split ? split.lastName : form.lastName,
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
      smsConsent: form.smsConsent,
      smsConsentNote: form.smsConsentNote,
      kind: form.kind,
      customFields,
    };

    if (mode === "create") {
      payload.status = form.status;
      if (canAssign && form.assignedToId) payload.assignedToId = form.assignedToId;
      const { ok, data } = await postJson<{ id: string }>("/api/app/contacts", payload);
      setLoading(false);
      if (!ok || !data?.id) {
        setError(data?.error ?? GENERIC_ERROR);
        return;
      }
      setSaved(true);
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
      setSaved(true);
      router.push(`/app/contacts/${contactId}`);
      router.refresh();
    }
  }

  const detailsCard = (
    <div className="ds-card p-5">
      <SectionHeader title={mode === "create" ? "More details" : "Client details"} className="mb-4" />
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Company (optional)</label>
          <input
            type="text"
            value={form.companyName}
            onChange={(e) => set("companyName", e.target.value)}
            placeholder="If this client is a business"
            className={inputCls}
          />
        </div>
        <div className="col-span-2">
          <label className="flex items-start gap-2.5 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.smsConsent}
              onChange={(e) => setForm((s) => ({ ...s, smsConsent: e.target.checked }))}
              className="mt-0.5 h-4 w-4 rounded"
            />
            <span>
              <span className="font-medium">Texts allowed</span>
              <span className="block text-xs text-gray-500 mt-0.5">
                Appointment reminders, schedule changes, and quote/invoice links go to the
                number above by text (from WorkBench, naming you). On by default — switch it
                off if this client asked not to be texted. A STOP reply turns it off on its own.
              </span>
            </span>
          </label>
          {form.smsConsent && (
            <input
              type="text"
              value={form.smsConsentNote}
              onChange={(e) => set("smsConsentNote", e.target.value)}
              placeholder="Optional note — e.g. asked on the phone 9/12"
              className={`${inputCls} mt-2`}
            />
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Lead source</label>
          <input
            type="text"
            value={form.leadSource}
            onChange={(e) => set("leadSource", e.target.value)}
            placeholder="Referral, Google, yard sign…"
            className={inputCls}
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
            className={inputCls}
          />
          <p className="text-xs text-gray-500 mt-1">Invoices due Net {form.paymentTermsDays || "30"}</p>
        </div>
        {mode === "edit" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.kind}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  kind: e.target.value,
                  // A business connection is never a lead
                  status: e.target.value === "CONTACT" && f.status === "LEAD" ? "ACTIVE" : f.status,
                }))
              }
              className={inputCls}
            >
              <option value="CLIENT">Client</option>
              <option value="CONTACT">Contact (business connection)</option>
            </select>
          </div>
        )}
        {mode === "edit" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={inputCls}
            >
              {form.kind !== "CONTACT" && <option value="LEAD">Lead</option>}
              <option value="ACTIVE">{form.kind === "CONTACT" ? "Active" : "Active client"}</option>
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
              className={inputCls}
            >
              <option value="">Me</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={3}
            className={`${inputCls} resize-none`}
            placeholder="Any notes about this customer…"
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BackLink href={backHref} />
        <PageTitle>
          {mode === "create"
            ? form.kind === "CONTACT"
              ? "New Contact"
              : form.status === "LEAD"
                ? "New Lead"
                : "New Client"
            : form.kind === "CONTACT"
              ? "Edit Contact"
              : "Edit Client"}
        </PageTitle>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}

        {/* Lead vs. client vs. contact — a lead works the pipeline board; a
            client is already-won business and skips it; a contact is a
            business connection (sub, supplier, referral partner) who becomes
            a client the day you schedule them a job */}
        {mode === "create" && (
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["lead", "Lead", "Goes on your Leads board to work toward a sale"],
                ["client", "Client", "Existing business — skips the Leads board"],
                ["contact", "Contact", "A business connection — a sub, supplier or referral partner. Becomes a client when you schedule them a job"],
              ] as const
            ).map(([value, label, hint]) => {
              const active =
                value === "contact" ? form.kind === "CONTACT" : form.kind !== "CONTACT" && form.status === (value === "lead" ? "LEAD" : "ACTIVE");
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      kind: value === "contact" ? "CONTACT" : "CLIENT",
                      status: value === "lead" ? "LEAD" : "ACTIVE",
                    }))
                  }
                  title={hint}
                  className={`rounded-[10px] border px-4 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-[color:var(--ds-primary)] ring-2 ring-[color:var(--ds-primary-soft)] text-gray-900"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <div className="ds-card p-5">
          <SectionHeader title="Contact info" className="mb-4" />
          <div className="grid grid-cols-2 gap-4">
            {mode === "create" ? (
              <div className="col-span-2">
                <label htmlFor="contact-name" className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  id="contact-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setName((n) => titleCaseName(n))}
                  required
                  autoComplete="off"
                  placeholder="Mike Jones"
                  className={inputCls}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First name *</label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    onBlur={() => set("firstName", titleCaseName(form.firstName))}
                    required
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last name (optional)</label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    onBlur={() => set("lastName", titleCaseName(form.lastName))}
                    className={inputCls}
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set("phone", formatPhoneAsTyped(e.target.value))}
                placeholder="(214) 555-0100"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="name@example.com"
                className={inputCls}
              />
            </div>
          </div>
        </div>

        <div className="ds-card p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <SectionHeader title="Address" />
            {/* Standing at the door: fill the address from the phone's GPS */}
            <UseMyLocation
              onFill={(a) =>
                setForm((f) => ({ ...f, address: a.street, city: a.city, state: a.state, zip: a.postalCode }))
              }
              className="text-right"
            />
          </div>
          <div className="space-y-3">
            <div>
              <label htmlFor="contact-street" className="block text-sm font-medium text-gray-700 mb-1">Street address</label>
              {/* Real addresses as you type: picking one fills city, state and ZIP */}
              <AddressAutocomplete
                id="contact-street"
                endpoint="/api/app/geocode/suggest"
                value={form.address}
                onChange={(v) => set("address", v)}
                onPick={(a) =>
                  setForm((f) => ({ ...f, address: a.street, city: a.city, state: a.state, zip: a.postalCode }))
                }
                className={inputCls}
                placeholder="Start typing — 123 Main St"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => set("city", e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <select
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  className={inputCls}
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
                inputMode="numeric"
                value={form.zip}
                onChange={(e) => set("zip", e.target.value)}
                maxLength={10}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Company-defined fields stay out front: the company asked for them */}
        {fieldDefs.length > 0 && (
          <div className="ds-card p-5">
            <SectionHeader title="Custom fields" className="mb-4" />
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
                      className={inputCls}
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
                      className={inputCls}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "create" ? (
          <MoreDetails
            open={more}
            onOpenChange={setMore}
            hint="company, texting, lead source, payment terms, notes"
          >
            {detailsCard}
          </MoreDetails>
        ) : (
          detailsCard
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary btn-lg"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {mode === "create"
              ? form.kind === "CONTACT"
                ? "Save contact"
                : form.status === "LEAD"
                  ? "Save lead"
                  : "Save client"
              : "Save changes"}
          </button>
          <Link
            href={backHref}
            className="px-5 py-2.5 btn-tool-line bg-white text-sm font-medium text-gray-600 rounded-[10px] hover:bg-gray-50 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
