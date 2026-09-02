"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
  MapPin,
  MoreHorizontal,
  Phone,
  Plus,
  Power,
  ShoppingCart,
  Trash2,
  Video,
  Wrench,
  X,
} from "lucide-react";
import Avatar from "@/components/Avatar";
import Modal from "@/components/Modal";
import { confirmSheet } from "@/components/ConfirmSheet";
import { SECTION_HUES, hueInk } from "@/lib/section-colors";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { BOOKING_KINDS, KIND_META, durationLabel, type BookingKind } from "@/lib/booking-types";

/**
 * Booking types — what customers can pick on /book/[slug]/schedule. Same
 * card + ⋯ shape as the forms list beneath it: tap the body to edit, the
 * secondary actions fold behind ⋯ on phones and sit inline on desktop.
 */

export type BookingTypeRow = {
  id: string;
  name: string;
  slug: string;
  kind: BookingKind;
  isActive: boolean;
  durationMinutes: number;
  confirmation: "INSTANT" | "APPROVAL";
  paymentMode: "NONE" | "DEPOSIT" | "FULL";
  members: { userId: string; name: string; eligible: boolean }[];
  serviceCount: number;
};

export const KIND_ICON: Record<BookingKind, typeof Phone> = {
  PHONE_CALL: Phone,
  VIDEO_CALL: Video,
  IN_PERSON: MapPin,
  SERVICE: Wrench,
};

export default function BookingTypesList({
  companySlug,
  baseUrl,
  types,
  previewMode = false,
}: {
  companySlug: string;
  baseUrl: string;
  types: BookingTypeRow[];
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BookingKind>("PHONE_CALL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const menuUrl = `${baseUrl}/book/${companySlug}/schedule`;
  const typeUrl = (t: BookingTypeRow) => `${menuUrl}/${t.slug}`;

  async function create() {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson<{ id: string }>("/api/app/booking-types", { name: name.trim() || KIND_META[kind].defaultName, kind }, "POST");
    setBusy(false);
    if (!ok || !data?.id) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push(`/app/settings/booking/types/${data.id}`);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson(`/api/app/booking-types/${id}`, body, "PATCH");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else {
      setMenuFor(null);
      router.refresh();
    }
  }

  async function copyLink(t: BookingTypeRow) {
    try {
      await navigator.clipboard.writeText(typeUrl(t));
      setCopied(t.id);
      setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 2000);
    } catch {
      setError("Couldn't copy — long-press the link to copy it manually.");
    }
  }

  async function remove(t: BookingTypeRow) {
    if (
      !(await confirmSheet({
        title: `Delete "${t.name}"?`,
        message: "Bookings it already produced stay on the schedule. Links to this booking page stop working.",
        confirmLabel: "Delete",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/booking-types/${t.id}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else {
      setMenuFor(null);
      router.refresh();
    }
  }

  const actionRow = (key: string, Icon: typeof Phone, label: string, onClick: () => void, danger = false) => (
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
    <section className="mb-8">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-gray-500">Booking types</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            What customers can schedule themselves — calls, estimates, services.{" "}
            {!previewMode && types.some((t) => t.isActive) && (
              <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="text-green-700 underline">
                Open your booking page
              </a>
            )}
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          aria-label="New booking type"
          className="flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white px-3 text-sm font-semibold text-gray-800"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">New booking type</span>
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {types.length === 0 ? (
        <div className="card-ledger p-5 text-sm text-gray-500">
          No booking types yet. Add a phone call or an in-person estimate and customers can pick a time from your booking page.
        </div>
      ) : (
        <div className="space-y-3">
          {types.map((t) => {
            const Icon = KIND_ICON[t.kind];
            const open = menuFor === t.id;
            const eligible = t.members.filter((m) => m.eligible);
            const warn =
              eligible.length === 0
                ? "Nobody can take these — add a bookable team member"
                : t.kind === "SERVICE" && t.serviceCount === 0
                  ? "No services yet"
                  : null;
            return (
              <div key={t.id} className={`card-ledger overflow-hidden ${t.isActive ? "" : "opacity-70"}`}>
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <Link href={`/app/settings/booking/types/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className="chip-tool flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                      style={{ backgroundColor: SECTION_HUES.forms, color: hueInk(SECTION_HUES.forms) }}
                      aria-hidden
                    >
                      <Icon size={17} strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold text-gray-900 lg:text-sm">
                        <span className="truncate">{t.name}</span>
                        {!t.isActive && <span className="stamp text-gray-500">Off</span>}
                        {t.confirmation === "APPROVAL" && <span className="stamp text-blue-800">Approval</span>}
                        {t.paymentMode !== "NONE" && (
                          <span className="stamp text-green-800">{t.paymentMode === "FULL" ? "Paid at booking" : "Deposit at booking"}</span>
                        )}
                        {warn && <span className="stamp text-amber-700">{warn}</span>}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                        <span className="truncate">
                          {KIND_META[t.kind].label} · {durationLabel(t.durationMinutes)}
                          {t.kind === "SERVICE" ? ` · ${t.serviceCount} service${t.serviceCount === 1 ? "" : "s"}` : ""}
                        </span>
                        {eligible.length > 0 && (
                          <span className="flex -space-x-1.5" title={eligible.map((m) => m.name).join(", ")}>
                            {eligible.slice(0, 4).map((m) => (
                              <Avatar key={m.userId} name={m.name} userId={m.userId} size={18} className="ring-2 ring-white" />
                            ))}
                            {eligible.length > 4 && (
                              <span className="flex h-[18px] items-center rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-600 ring-2 ring-white">
                                +{eligible.length - 4}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>

                  <div className="hidden shrink-0 items-center gap-2 lg:flex">
                    {!previewMode && t.isActive && (
                      <>
                        <button
                          onClick={() => copyLink(t)}
                          className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          title="Copy link"
                        >
                          {copied === t.id ? <Check size={14} className="text-green-600" /> : <Link2 size={14} />}
                        </button>
                        <a
                          href={typeUrl(t)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                          title="Open booking page"
                        >
                          <ExternalLink size={14} />
                        </a>
                      </>
                    )}
                    <button
                      onClick={() => patch(t.id, { isActive: !t.isActive })}
                      disabled={busy}
                      className="rounded-full px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
                    >
                      {t.isActive ? "Turn off" : "Turn on"}
                    </button>
                    <Link
                      href={`/app/settings/booking/types/${t.id}`}
                      className="rounded-[10px] bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-700"
                    >
                      Edit
                    </Link>
                    <button
                      onClick={() => remove(t)}
                      disabled={busy}
                      className="rounded-full p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <ChevronRight size={16} className="shrink-0 text-gray-300 lg:hidden" />
                  <button
                    onClick={() => setMenuFor(open ? null : t.id)}
                    aria-label={`Actions for ${t.name}`}
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
                    {!previewMode && t.isActive && actionRow("copy", copied === t.id ? Check : Link2, copied === t.id ? "Link copied" : "Copy link", () => copyLink(t))}
                    {!previewMode && t.isActive && (
                      <a
                        href={typeUrl(t)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium text-gray-800 transition-colors active:bg-gray-50"
                      >
                        <ExternalLink size={17} className="text-gray-400" />
                        Open booking page
                      </a>
                    )}
                    {actionRow("toggle", Power, t.isActive ? "Turn off" : "Turn on", () => patch(t.id, { isActive: !t.isActive }))}
                    {actionRow("del", Trash2, "Delete", () => remove(t), true)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => {
          if (!busy) setCreating(false);
        }}
        cardClassName="w-full max-w-lg rounded-lg bg-white p-5 text-left shadow-xl"
      >
        {creating && (
          <>
            <h2 className="mb-3 text-base font-semibold text-gray-900">New booking type</h2>
            <p className="mb-1.5 text-xs font-medium text-gray-500">What are they booking?</p>
            <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
              {BOOKING_KINDS.map((k) => {
                const meta = KIND_META[k];
                const Icon = KIND_ICON[k];
                const active = kind === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                      active ? "border-green-500 bg-green-50 ring-1 ring-green-500" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Icon size={17} className={`mt-0.5 shrink-0 ${active ? "text-green-600" : "text-gray-400"}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900">{meta.label}</span>
                      <span className="mt-0.5 block text-xs text-gray-500">{meta.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <label className="mb-1 mt-4 block text-xs font-medium text-gray-500">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={KIND_META[kind].defaultName}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <div className="mt-4 flex flex-col gap-2 lg:flex-row lg:items-center">
              <button
                onClick={create}
                disabled={busy}
                className="flex h-11 items-center justify-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50 lg:h-10"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Create &amp; set up
              </button>
              <button
                onClick={() => setCreating(false)}
                disabled={busy}
                className="flex h-11 items-center justify-center rounded-[10px] px-4 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 lg:h-10"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>
    </section>
  );
}

// Re-exported so the forms list can share the same icon vocabulary
export { CalendarClock, ShoppingCart };
