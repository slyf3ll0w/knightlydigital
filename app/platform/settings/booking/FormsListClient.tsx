"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Copy,
  ExternalLink,
  Inbox,
  Loader2,
  Plus,
  ShoppingCart,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * Your public forms: one default (answers the original /book and /embed
 * URLs) plus any number of inquiry / booking / service-request forms, each
 * with its own URL, embed snippet, and fully customizable layout.
 */

type FormRow = {
  id: string;
  name: string;
  slug: string;
  type: "INQUIRY" | "BOOKING" | "SERVICE_REQUEST";
  isDefault: boolean;
  isActive: boolean;
};

const TYPE_META = {
  INQUIRY: { label: "Inquiry", icon: Inbox, hint: "Collects info and creates a lead for sales to reach out." },
  BOOKING: { label: "Booking", icon: CalendarDays, hint: "Includes a preferred date so clients can book an estimate." },
  SERVICE_REQUEST: { label: "Service Request", icon: ShoppingCart, hint: "Clients pick services; an invoice is created automatically." },
} as const;

export default function FormsListClient({
  companySlug,
  baseUrl,
  forms,
  schedulingCard,
}: {
  companySlug: string;
  baseUrl: string;
  forms: FormRow[];
  schedulingCard?: React.ReactNode;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FormRow["type"]>("INQUIRY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const formUrl = (f: FormRow) =>
    f.isDefault ? `${baseUrl}/book/${companySlug}` : `${baseUrl}/book/${companySlug}/${f.slug}`;

  async function createForm() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson<{ id: string }>("/api/app/web-forms", { name, type }, "POST");
    setBusy(false);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push(`/app/settings/booking/${data.id}`);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/web-forms/${id}`, body, "PATCH");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  async function duplicate(f: FormRow) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/web-forms/${f.id}/duplicate`, undefined, "POST");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  async function remove(f: FormRow) {
    const warning = f.isDefault
      ? `Delete "${f.name}"? Everything it collected (clients, requests, invoices) is kept. Another form becomes the default and answers your original links.`
      : `Delete "${f.name}"? Everything it collected (clients, requests, invoices) is kept, but links and embeds pointing at this form stop working.`;
    if (!confirm(warning)) return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/web-forms/${f.id}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  return (
    <div className="p-4 lg:p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h1 className="numeral-ledger text-2xl font-semibold text-gray-900">Forms</h1>
        <button
          onClick={() => setCreating((v) => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded-full transition-colors"
        >
          <Plus size={15} />
          New Form
        </button>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Public forms for your website — each has its own link and embed code.
      </p>

      {schedulingCard}

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {creating && (
        <div className="card-ledger p-5 mb-6 space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Form name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring Special, Contact Us, Order a Mow"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(Object.keys(TYPE_META) as FormRow["type"][]).map((t) => {
              const meta = TYPE_META[t];
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active ? "border-green-500 bg-green-50 ring-1 ring-green-500" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <meta.icon size={16} className={active ? "text-green-600" : "text-gray-400"} />
                  <p className="text-sm font-semibold text-gray-900 mt-1.5">{meta.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{meta.hint}</p>
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <button
              onClick={createForm}
              disabled={busy || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-semibold rounded-full disabled:opacity-50"
            >
              {busy && <Loader2 size={13} className="animate-spin" />}
              Create & Customize
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {forms.map((f) => {
          const meta = TYPE_META[f.type];
          return (
            <div
              key={f.id}
              className={`card-ledger px-4 py-3.5 sm:flex sm:flex-wrap sm:items-center sm:gap-3 ${
                f.isActive ? "" : "opacity-60"
              }`}
            >
              {/* Identity — full-width on phones so the name never squeezes */}
              <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                <meta.icon size={18} className="text-gray-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-gray-900">
                    {f.name}
                    {f.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-500/30">
                        <Star size={9} /> Default
                      </span>
                    )}
                    {!f.isActive && <span className="text-xs text-red-500">off</span>}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {meta.label} ·{" "}
                    <a href={formUrl(f)} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {formUrl(f).replace(/^https?:\/\//, "")}
                    </a>
                  </p>
                </div>
              </div>

              {/* Actions — their own row on phones, inline on desktop */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 sm:mt-0 sm:gap-2">
                <a
                  href={formUrl(f)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
                  title="Open form"
                >
                  <ExternalLink size={14} />
                </a>
                {!f.isDefault && (
                  <button
                    onClick={() => patch(f.id, { isDefault: true })}
                    disabled={busy}
                    className="px-2.5 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100"
                    title="The default form answers your original /book and /embed links"
                  >
                    Make default
                  </button>
                )}
                {!f.isDefault && (
                  <button
                    onClick={() => patch(f.id, { isActive: !f.isActive })}
                    disabled={busy}
                    className="px-2.5 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:bg-gray-100"
                  >
                    {f.isActive ? "Turn off" : "Turn on"}
                  </button>
                )}
                <button
                  onClick={() => duplicate(f)}
                  disabled={busy}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full"
                  title="Duplicate form"
                >
                  <Copy size={14} />
                </button>
                <span className="flex-1 sm:hidden" aria-hidden />
                <Link
                  href={`/app/settings/booking/${f.id}`}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold text-white bg-gray-900 hover:bg-gray-700"
                >
                  Customize
                </Link>
                <button
                  onClick={() => remove(f)}
                  disabled={busy}
                  className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                  title="Delete form"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
