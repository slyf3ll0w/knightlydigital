"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Check, FileText, Loader2, MoreHorizontal, Pencil, Receipt, Trash2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO, appointmentTypeLabel } from "@/lib/statuses";
import SlotTimePicker from "@/components/SlotTimePicker";
import { endFollowingStart } from "@/lib/scheduling";
import { confirmSheet } from "@/components/ConfirmSheet";
import PeoplePicker from "@/components/PeoplePicker";
import ScheduleHeadsUp, { useScheduleCheck } from "@/components/ScheduleHeadsUp";
import Modal from "@/components/Modal";
import MenuPopover from "@/components/MenuPopover";

/**
 * Appointment lifecycle controls: Complete (→ Create Quote CTA), No-show,
 * Cancel, Reopen, inline reschedule, full edit dialog (type, title, address,
 * meeting link, notes, assignee for managers), and delete (managers).
 */

const APPT_TYPES = ["IN_PERSON", "PHONE_CALL", "VIDEO_CALL"] as const;

type Details = {
  title: string;
  type: string;
  address: string;
  meetingLink: string;
  notes: string;
  /** Everyone on it, lead first (lib/appointment-people.ts). */
  assigneeIds: string[];
};

function toLocalInput(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AppointmentActions({
  appointmentId,
  status,
  contactId,
  contactName = "",
  requestId,
  canDelete,
  canInvoice = false,
  hasQuote = false,
  hasInvoice = false,
  scheduledAt,
  scheduledEnd,
  scheduledAnytime,
  details,
  users = [],
  intervalMinutes = 30,
  dayStartMinutes,
}: {
  appointmentId: string;
  status: string;
  contactId: string;
  contactName?: string;
  requestId: string | null;
  canDelete: boolean;
  /** Money roles only: the straight-to-invoice path (work done on the spot). */
  canInvoice?: boolean;
  /** A quote already came out of this appointment (its request) — no second Create Quote. */
  hasQuote?: boolean;
  /** An invoice was already billed from it — no second Create Invoice. */
  hasInvoice?: boolean;
  scheduledAt: string;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  details: Details;
  users?: { id: string; name: string }[];
  intervalMinutes?: number;
  dayStartMinutes?: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [anytime, setAnytime] = useState(scheduledAnytime);
  const [start, setStart] = useState(toLocalInput(scheduledAt));
  const [end, setEnd] = useState(toLocalInput(scheduledEnd));
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Details>(details);

  // Live heads-up (overlaps + drive time) while picking a new time, and in
  // the edit dialog while changing who is on it or where it is
  const rescheduleCheck = useScheduleCheck(
    rescheduling && !anytime
      ? {
          start,
          end,
          userIds: details.assigneeIds,
          onSite: details.type === "IN_PERSON",
          address: details.address,
          contactId,
          excludeAppointmentId: appointmentId,
        }
      : null
  );
  const savedStart = toLocalInput(scheduledAt);
  const editCheck = useScheduleCheck(
    // only once something that matters changed — opening Edit to fix a typo
    // shouldn't raise a warning about the time it already had
    editing &&
      !scheduledAnytime &&
      status === "SCHEDULED" &&
      (form.assigneeIds.join() !== details.assigneeIds.join() || form.type !== details.type || form.address !== details.address)
      ? {
          start: savedStart,
          end: toLocalInput(scheduledEnd) || endFollowingStart("", "", savedStart, 60),
          userIds: form.assigneeIds,
          onSite: form.type === "IN_PERSON",
          address: form.address,
          contactId,
          excludeAppointmentId: appointmentId,
        }
      : null
  );

  function openEdit() {
    setForm(details);
    setError("");
    setMenuOpen(false);
    setEditing(true);
  }

  // Same idea for the reschedule strip: start from what's saved, not from
  // whatever was typed and abandoned last time (or from the first render's
  // props, which router.refresh() has since moved past)
  function openReschedule() {
    setAnytime(scheduledAnytime);
    setStart(toLocalInput(scheduledAt));
    setEnd(toLocalInput(scheduledEnd));
    setError("");
    setMenuOpen(false);
    setRescheduling(true);
  }

  async function saveEdit() {
    if (!form.title.trim()) {
      setError("The appointment needs a title.");
      return;
    }
    if (form.type === "IN_PERSON" && !form.address.trim()) {
      setError("In-person appointments need an address.");
      return;
    }
    const ok = await patch({
      title: form.title,
      type: form.type,
      address: form.address,
      meetingLink: form.meetingLink,
      notes: form.notes,
      ...(users.length > 0 && { assigneeIds: form.assigneeIds }),
    });
    if (ok) setEditing(false);
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const { ok, data } = await postJson<{ conflicts?: string[] }>(
      `/api/app/appointments/${appointmentId}`,
      body,
      "PATCH"
    );
    setBusy(false);
    if (!ok) {
      setError((data as { error?: string } | null)?.error ?? GENERIC_ERROR);
      return false;
    }
    setMenuOpen(false);
    // Overlaps and drive time were shown live under the fields before the
    // save (ScheduleHeadsUp) — no second pop-up after it.
    router.refresh();
    return true;
  }

  async function remove() {
    if (
      !(await confirmSheet({
        title: "Delete this appointment?",
        message: "This can't be undone.",
        confirmLabel: "Delete Appointment",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/appointments/${appointmentId}`, {}, "DELETE");
    setBusy(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    router.push("/app/schedule");
  }

  async function saveReschedule() {
    // A date with no time yet is a bare "YYYY-MM-DD" from the picker — not a
    // schedule, and it used to save as UTC midnight (the evening before)
    if (!anytime && [start, end].some((v) => v && v.length < 16)) {
      setError("Pick a time, or choose Anytime");
      return;
    }
    const ok = await patch(
      anytime
        ? {
            scheduledAt: localInputToISO(`${start.slice(0, 10)}T12:00`),
            scheduledEnd: null,
            scheduledAnytime: true,
          }
        : {
            scheduledAt: localInputToISO(start),
            scheduledEnd: localInputToISO(end),
            scheduledAnytime: false,
          }
    );
    if (ok) setRescheduling(false);
  }

  const quoteHref = `/app/quotes/new?contactId=${contactId}${requestId ? `&requestId=${requestId}` : ""}`;
  // Straight to an invoice — the work ended up happening right there, so no
  // quote and no job in between (David 2026-10-02). The invoice route marks
  // the appointment complete itself.
  const invoiceHref = `/app/invoices/new?appointmentId=${appointmentId}&contactId=${contactId}`;
  const [wrapUp, setWrapUp] = useState(false);

  // Wrapping up: the usual next step is a quote (if the client approves it on
  // the spot, the quote is what becomes the job). When the work was done
  // during the visit, money roles can bill it directly instead.
  async function complete() {
    const ok = await patch({ status: "COMPLETED" });
    if (!ok) return;
    if (canInvoice) {
      setWrapUp(true);
      return;
    }
    const writeQuote = await confirmSheet({
      title: "Appointment complete",
      message: `Want to write a quote${contactName ? ` for ${contactName}` : ""}? If they approve it on the spot, it becomes a job. You can also do this later from this page.`,
      confirmLabel: "Create Quote",
      cancelLabel: "Not now",
    });
    if (writeQuote) router.push(quoteHref);
  }

  // Primary action — a docked tinted-glass pill above the tab bar on phones
  // (always at the thumb), a normal header button on desktop. Same classes
  // the job page's Complete Job pill uses; centered without a transform.
  const primaryCls =
    "btn-primary glass-tinted max-lg:fixed max-lg:inset-x-0 max-lg:mx-auto max-lg:w-max max-lg:bottom-[calc(5.5rem+env(safe-area-inset-bottom))] max-lg:z-30 max-lg:rounded-full max-lg:px-6 max-lg:py-3 max-lg:text-[15px]";

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Wrap-up after Complete: quote, invoice on the spot, or nothing yet */}
      <Modal open={wrapUp} onClose={() => setWrapUp(false)} size="sm">
        <div className="space-y-3 text-left">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Appointment complete</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              What&apos;s next{contactName ? ` for ${contactName}` : ""}? A quote becomes a job when they approve it.
              If the work already happened, bill it now — no quote or job needed.
            </p>
          </div>
          <div className="grid gap-2">
            <Link href={quoteHref} className="btn-primary btn-lg" onClick={() => setWrapUp(false)}>
              <FileText size={15} /> Create Quote
            </Link>
            <Link
              href={invoiceHref}
              onClick={() => setWrapUp(false)}
              className="flex items-center gap-2 rounded-[10px] btn-tool-line bg-[color:var(--ds-secondary-soft)] px-4 py-2.5 text-sm font-semibold text-[color:var(--ds-secondary)] hover:bg-[color-mix(in_srgb,var(--ds-secondary)_18%,transparent)]"
            >
              <Receipt size={15} /> Create Invoice
            </Link>
            <button
              type="button"
              onClick={() => setWrapUp(false)}
              className="flex items-center gap-2 rounded-[10px] btn-tool-line bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Not now
            </button>
          </div>
        </div>
      </Modal>
      <div className="flex items-center gap-2">
        {status === "SCHEDULED" && (
          <button onClick={complete} disabled={busy} className={primaryCls}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Complete Appointment
          </button>
        )}
        {/* After Complete, both doors stay open until one is used (David
            2026-10-03: backing out of the new invoice left only Create
            Quote). The quote is the docked pill on phones; the invoice sits
            in the header row for money roles. */}
        {status === "COMPLETED" && !hasQuote && (
          <Link href={quoteHref} className={primaryCls}>
            <FileText size={14} />
            Create Quote
          </Link>
        )}
        {status === "COMPLETED" && canInvoice && !hasInvoice && (
          <Link
            href={invoiceHref}
            className="flex items-center gap-1.5 rounded-[10px] btn-tool-line bg-[color:var(--ds-secondary-soft)] px-3 py-2 text-sm font-semibold text-[color:var(--ds-secondary)] hover:bg-[color-mix(in_srgb,var(--ds-secondary)_18%,transparent)]"
          >
            <Receipt size={14} />
            Create Invoice
          </Link>
        )}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-2 btn-tool-line bg-white rounded-[10px] text-gray-500 hover:bg-gray-50"
          >
            <MoreHorizontal size={16} />
          </button>
          {menuOpen && (
            <MenuPopover open={menuOpen} onClose={() => setMenuOpen(false)} title="Appointment">
              {canInvoice && status !== "CANCELLED" && !hasInvoice && (
                <Link
                  href={invoiceHref}
                  onClick={() => setMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <Receipt size={13} className="text-gray-400" />
                  Create Invoice
                </Link>
              )}
              <button
                onClick={openEdit}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Pencil size={13} className="text-gray-400" />
                Edit Details
              </button>
              <button
                onClick={openReschedule}
                className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <CalendarDays size={13} className="text-gray-400" />
                Reschedule
              </button>
              {status === "SCHEDULED" && (
                <>
                  <button
                    onClick={() => patch({ status: "NO_SHOW" })}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <X size={13} className="text-gray-400" />
                    Mark No-show
                  </button>
                  <button
                    onClick={() => patch({ status: "CANCELLED" })}
                    className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <X size={13} />
                    Cancel Appointment
                  </button>
                </>
              )}
              {status !== "SCHEDULED" && (
                <button
                  onClick={() => patch({ status: "SCHEDULED" })}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <CalendarDays size={13} className="text-gray-400" />
                  Reopen
                </button>
              )}
              {canDelete && (
                <button
                  onClick={remove}
                  className="flex w-full items-center gap-2 px-3.5 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={13} />
                  Delete
                </button>
              )}
            </MenuPopover>
          )}
        </div>
      </div>

      {rescheduling && (
        <div className="flex flex-wrap items-end justify-end gap-2 ds-card p-3">
          {anytime ? (
            <div>
              <label className="block text-xs text-gray-500 mb-0.5">Date</label>
              <input
                type="date"
                value={start.slice(0, 10)}
                onChange={(e) => setStart(`${e.target.value}T12:00`)}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Start</label>
                <SlotTimePicker
                  value={start}
                  intervalMinutes={intervalMinutes}
                  dayStartMinutes={dayStartMinutes}
                  inputCls="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                  ariaLabel="Start"
                  onChange={(next) => {
                    // The end keeps the length it had (David 2026-10-06):
                    // a 1-hour visit moved to 1:00 now ends at 2:00
                    setEnd(endFollowingStart(start, end, next, 30));
                    setStart(next);
                  }}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">End</label>
                <SlotTimePicker
                  value={end}
                  intervalMinutes={intervalMinutes}
                  dayStartMinutes={dayStartMinutes}
                  inputCls="px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                  ariaLabel="End"
                  onChange={setEnd}
                />
              </div>
            </>
          )}
          <label className="flex items-center gap-1.5 pb-2 text-xs text-gray-600 select-none">
            <input
              type="checkbox"
              checked={anytime}
              onChange={(e) => setAnytime(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
            />
            Anytime
          </label>
          <button
            onClick={saveReschedule}
            disabled={busy}
            className="btn-primary btn-sm"
          >
            Save
          </button>
          <button onClick={() => setRescheduling(false)} className="p-1.5 text-gray-400 hover:text-gray-600">
            <X size={15} />
          </button>
        </div>
      )}
      {rescheduling && !anytime && <ScheduleHeadsUp result={rescheduleCheck} />}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Modal
        open={editing}
        onClose={() => {
          if (!busy) setEditing(false);
        }}
      >
        {editing && (
          <div className="space-y-3 text-left">
            <h2 className="text-base font-semibold text-gray-900">Edit Appointment</h2>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                >
                  {APPT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {appointmentTypeLabel[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {users.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Team members</label>
                <PeoplePicker
                  users={users}
                  value={form.assigneeIds}
                  allowNone
                  onChange={(ids) => setForm((f) => ({ ...f, assigneeIds: ids }))}
                />
              </div>
            )}
            <ScheduleHeadsUp result={editCheck} />

            {form.type === "IN_PERSON" && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">Address</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                  placeholder="Where you'll meet the client"
                />
              </div>
            )}
            {form.type === "VIDEO_CALL" && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">
                  Meeting link
                </label>
                <input
                  type="url"
                  value={form.meetingLink}
                  onChange={(e) => setForm((f) => ({ ...f, meetingLink: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
                  placeholder="https://meet.google.com/..."
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-0.5">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)] resize-none"
              />
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setEditing(false)}
                disabled={busy}
                className="px-4 py-2 text-sm font-medium text-gray-600 rounded-[10px] hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={busy}
                className="btn-primary"
              >
                {busy && <Loader2 size={13} className="animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
