"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Files,
  Globe,
  Inbox,
  Link2,
  Loader2,
  MoreHorizontal,
  Plus,
  Power,
  ShoppingCart,
  Star,
  Trash2,
  X,
} from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES, hueInk } from "@/lib/section-colors";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { confirmSheet } from "@/components/ConfirmSheet";

/**
 * Your public forms: one default (answers the original /book and /embed
 * URLs) plus any number of inquiry / booking / service-request forms, each
 * with its own URL, embed snippet, and fully customizable layout.
 *
 * Mobile shape: each form is a card whose body taps through to the builder,
 * with the six secondary actions folded behind a ⋯ that expands an iOS-style
 * action list inside the card. They used to sit as a wrapping row of six
 * pills, which at phone widths ran three lines deep per form.
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
  previewMode = false,
}: {
  companySlug: string;
  baseUrl: string;
  forms: FormRow[];
  schedulingCard?: React.ReactNode;
  /** Pre-approval: form links stay hidden so nothing public can be shared */
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FormRow["type"]>("INQUIRY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Which card has its action list expanded (phones only) */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const formUrl = (f: FormRow) =>
    f.isDefault ? `${baseUrl}/book/${companySlug}` : `${baseUrl}/book/${companySlug}/${f.slug}`;

  useEffect(() => {
    if (!creating) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setCreating(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [creating, busy]);

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
    else {
      setMenuFor(null);
      router.refresh();
    }
  }

  async function duplicate(f: FormRow) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/web-forms/${f.id}/duplicate`, undefined, "POST");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else {
      setMenuFor(null);
      router.refresh();
    }
  }

  async function copyLink(f: FormRow) {
    try {
      await navigator.clipboard.writeText(formUrl(f));
      setCopied(f.id);
      setTimeout(() => setCopied((c) => (c === f.id ? null : c)), 2000);
    } catch {
      setError("Couldn't copy — long-press the link to copy it manually.");
    }
  }

  async function remove(f: FormRow) {
    const warning = f.isDefault
      ? "Everything it collected (clients, requests, invoices) is kept. Another form becomes the default and answers your original links."
      : "Everything it collected (clients, requests, invoices) is kept, but links and embeds pointing at this form stop working.";
    if (
      !(await confirmSheet({
        title: `Delete "${f.name}"?`,
        message: warning,
        confirmLabel: "Delete Form",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/web-forms/${f.id}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else {
      setMenuFor(null);
      router.refresh();
    }
  }

  /** One row of the expanded phone action list. */
  const actionRow = (
    key: string,
    Icon: typeof Inbox,
    label: string,
    onClick: () => void,
    danger = false
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium transition-colors active:bg-gray-50 disabled:opacity-50 ${
        danger ? "text-red-600" : "text-gray-800"
      }`}
    >
      <Icon size={17} className={danger ? "text-red-500" : "text-gray-400"} />
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl p-4 lg:p-8">
      <div className="flex items-center justify-between gap-3">
        <PageTitle section="forms" icon={Globe}>
          Forms
        </PageTitle>
        <button
          onClick={() => setCreating(true)}
          aria-label="New form"
          className="flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-3 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 sm:px-4"
        >
          <Plus size={16} />
          <span className="hidden sm:inline">New Form</span>
        </button>
      </div>
      <p className="mb-5 mt-2 text-sm text-gray-500 lg:mb-6">
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

      <div className="space-y-3">
        {forms.map((f) => {
          const meta = TYPE_META[f.type];
          const url = formUrl(f);
          const open = menuFor === f.id;
          return (
            <div key={f.id} className={`card-ledger overflow-hidden ${f.isActive ? "" : "opacity-70"}`}>
              <div className="flex items-center gap-3 px-4 py-3.5">
                {/* Tap the body to open the builder — the primary action */}
                <Link
                  href={`/app/settings/booking/${f.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span
                    className="chip-tool flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                    style={{
                      backgroundColor: SECTION_HUES.forms,
                      color: hueInk(SECTION_HUES.forms),
                    }}
                    aria-hidden
                  >
                    <meta.icon size={17} strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-gray-900 lg:text-sm">
                      <span className="truncate">{f.name}</span>
                      {f.isDefault && (
                        <span className="stamp text-amber-700">
                          <Star size={9} fill="currentColor" strokeWidth={0} />
                          Default
                        </span>
                      )}
                      {!f.isActive && <span className="stamp text-gray-500">Off</span>}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-gray-500">
                      {meta.label} ·{" "}
                      {previewMode ? (
                        <span className="text-gray-400">link unlocks at approval</span>
                      ) : (
                        url.replace(/^https?:\/\//, "")
                      )}
                    </span>
                  </span>
                </Link>

                {/* Desktop: the actions stay inline where there's room */}
                <div className="hidden shrink-0 items-center gap-2 lg:flex">
                  {!previewMode && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title="Open form"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  {!f.isDefault && (
                    <button
                      onClick={() => patch(f.id, { isDefault: true })}
                      disabled={busy}
                      className="rounded-full px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                      title="The default form answers your original /book and /embed links"
                    >
                      Make default
                    </button>
                  )}
                  {!f.isDefault && (
                    <button
                      onClick={() => patch(f.id, { isActive: !f.isActive })}
                      disabled={busy}
                      className="rounded-full px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      {f.isActive ? "Turn off" : "Turn on"}
                    </button>
                  )}
                  <button
                    onClick={() => duplicate(f)}
                    disabled={busy}
                    className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    title="Duplicate form"
                  >
                    <Copy size={14} />
                  </button>
                  <Link
                    href={`/app/settings/booking/${f.id}`}
                    className="rounded-[10px] bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700"
                  >
                    Customize
                  </Link>
                  <button
                    onClick={() => remove(f)}
                    disabled={busy}
                    className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete form"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {/* Phones: chevron into the builder, ⋯ for everything else */}
                <ChevronRight size={16} className="shrink-0 text-gray-300 lg:hidden" />
                <button
                  onClick={() => setMenuFor(open ? null : f.id)}
                  aria-label={`Actions for ${f.name}`}
                  aria-expanded={open}
                  className={`-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors active:bg-gray-100 lg:hidden ${
                    open ? "bg-gray-100 text-gray-700" : "text-gray-400"
                  }`}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>

              {open && (
                <div className="divide-y divide-gray-100 border-t border-gray-100 lg:hidden">
                  {!previewMode &&
                    actionRow(
                      "copy",
                      copied === f.id ? Check : Link2,
                      copied === f.id ? "Link copied" : "Copy link",
                      () => copyLink(f)
                    )}
                  {!previewMode && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium text-gray-800 transition-colors active:bg-gray-50"
                    >
                      <ExternalLink size={17} className="text-gray-400" />
                      Open form
                    </a>
                  )}
                  {!f.isDefault &&
                    actionRow("default", Star, "Make default", () =>
                      patch(f.id, { isDefault: true })
                    )}
                  {!f.isDefault &&
                    actionRow("toggle", Power, f.isActive ? "Turn off" : "Turn on", () =>
                      patch(f.id, { isActive: !f.isActive })
                    )}
                  {actionRow("dup", Files, "Duplicate", () => duplicate(f))}
                  {actionRow("del", Trash2, "Delete form", () => remove(f), true)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New-form dialog — bottom sheet on phones. The type picker used to be
          three tall cards stacked inline, which buried the Create button. */}
      {creating && (
        <div
          className="modal-pop fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => !busy && setCreating(false)}
        >
          <div
            className="modal-card w-full max-w-lg rounded-lg bg-white p-5 text-left shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-3 text-base font-semibold text-gray-900">New Form</h2>

            <label className="mb-1 block text-xs font-medium text-gray-500">Form name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spring Special, Contact Us"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <p className="mb-1.5 mt-4 text-xs font-medium text-gray-500">What it does</p>
            <div className="space-y-2 lg:grid lg:grid-cols-3 lg:gap-2 lg:space-y-0">
              {(Object.keys(TYPE_META) as FormRow["type"][]).map((t) => {
                const meta = TYPE_META[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors lg:block ${
                      active
                        ? "border-green-500 bg-green-50 ring-1 ring-green-500"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <meta.icon
                      size={17}
                      className={`mt-0.5 shrink-0 lg:mt-0 ${active ? "text-green-600" : "text-gray-400"}`}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 lg:mt-1.5">
                        {meta.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500">{meta.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
              <button
                onClick={createForm}
                disabled={busy || !name.trim()}
                className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50 lg:h-10"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Create &amp; Customize
              </button>
              <button
                onClick={() => setCreating(false)}
                disabled={busy}
                className="flex h-11 items-center justify-center rounded-[10px] px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 lg:h-10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
